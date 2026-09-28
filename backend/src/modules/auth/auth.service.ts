import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  createHash,
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { AuthSurface } from '../../common/decorators/access-policy.decorator';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PermissionResolverService } from '../rbac/permission-resolver.service';
import {
  AdminLoginDto,
  ChangePasswordDto,
  RefreshTokenDto,
  RequestOtpDto,
  VerifyOtpDto,
} from './dto/auth.dto';
import { hashPassword, verifyPassword } from './password';
import { SmsGatewayService } from './sms-gateway.service';

const userAccessInclude = { role: true, work_profile: true } as const;
const APP_ROLES = new Set(['customer', 'delivery_agent', 'order_monitor']);
const MAX_LOGIN_FAILURES = 5;
const LOCK_MINUTES = 15;

type AccessUser = {
  id: string;
  name: string | null;
  phone: string | null;
  username: string | null;
  email: string | null;
  created_at: Date;
  password_hash?: string | null;
  is_active: boolean;
  must_change_password: boolean;
  failed_login_attempts?: number;
  locked_until?: Date | null;
  session_version: number;
  permission_version: number;
  role: { name: string } | null;
  work_profile: { app_role: string; is_active: boolean } | null;
};

type RefreshPayload = {
  sub: string;
  typ: 'refresh';
  jti: string;
  surface: AuthSurface;
  client?: 'mobile' | 'web_store';
  ver: number;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly sms: SmsGatewayService,
    @Optional() private readonly permissions?: PermissionResolverService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async requestOtp(input: RequestOtpDto) {
    const phone = input.phone.trim();
    const development = this.config.get<string>('APP_ENV') === 'development';
    const code = development
      ? this.config.get<string>('DEV_OTP', '000000')
      : randomInt(0, 1_000_000).toString().padStart(6, '0');
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.get<number>('OTP_TTL_SECONDS', 300) * 1000,
    );
    const [, createdOtp] = await this.prisma.$transaction([
      this.prisma.otpCode.updateMany({
        where: { phone, consumed_at: null },
        data: { consumed_at: now },
      }),
      this.prisma.otpCode.create({
        data: {
          phone,
          code_hash: this.hashOtp(phone, code),
          expires_at: expiresAt,
        },
      }),
    ]);
    try {
      await this.sms.sendOtp(phone, code);
    } catch (error) {
      await this.prisma.otpCode.update({
        where: { id: createdOtp.id },
        data: { consumed_at: new Date() },
      });
      throw error;
    }
    if (development) {
      this.logger.warn(`Development OTP for ${phone}: ${code}`);
      return { otp_sent: true, dev_otp: code };
    }
    return { otp_sent: true };
  }

  async verifyOtp(input: VerifyOtpDto) {
    const phone = input.phone.trim();
    const now = new Date();
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, consumed_at: null, expires_at: { gt: now } },
      orderBy: { created_at: 'desc' },
    });
    if (
      !otp ||
      !this.matchesHash(otp.code_hash, this.hashOtp(phone, input.code))
    ) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.otpCode.updateMany({
        where: { id: otp.id, consumed_at: null, expires_at: { gt: now } },
        data: { consumed_at: now },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException('Invalid or expired OTP');
      }

      let existing = await tx.user.findUnique({
        where: { phone },
        include: userAccessInclude,
      });
      if (!existing) {
        const customerRole = await tx.role.findUnique({
          where: { name: 'customer' },
        });
        if (!customerRole) {
          throw new ServiceUnavailableException(
            'Access seed has not been applied',
          );
        }
        existing = await tx.user.create({
          data: { phone, role_id: customerRole.id },
          include: userAccessInclude,
        });
      }
      if (!existing.is_active) {
        throw new UnauthorizedException('Account is inactive');
      }
      if (
        existing.work_profile &&
        (!existing.work_profile.is_active ||
          existing.work_profile.app_role !== existing.role?.name)
      ) {
        throw new UnauthorizedException('Work phone has been revoked');
      }
      if (!existing.role || !APP_ROLES.has(existing.role.name)) {
        const customerRole = await tx.role.findUnique({
          where: { name: 'customer' },
        });
        if (!customerRole) {
          throw new ServiceUnavailableException(
            'Access seed has not been applied',
          );
        }
        existing = await tx.user.update({
          where: { id: existing.id },
          data: {
            role_id: customerRole.id,
            session_version: { increment: 1 },
          },
          include: userAccessInclude,
        });
      }
      return existing;
    });

    const client = input.client ?? 'mobile';
    const tokens = await this.issueTokenPair(
      user.id,
      'app',
      client,
      user.session_version,
    );
    return { ...tokens, user: await this.toUser(user, 'app', client) };
  }

  async adminLogin(input: AdminLoginDto, ip?: string) {
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { username: input.username },
      include: userAccessInclude,
    });
    if (user?.locked_until && user.locked_until > now) {
      await this.recordLogin(user.id, input.username, 'locked', ip);
      throw new HttpException(
        {
          status: 429,
          code: 'ACCOUNT_LOCKED',
          message:
            'Account is temporarily locked after repeated login failures',
          errors: [],
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const valid = Boolean(
      user?.is_active &&
      user.password_hash &&
      (await verifyPassword(user.password_hash, input.password)),
    );
    if (!user || !valid) {
      if (user) {
        const failures = user.failed_login_attempts + 1;
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            failed_login_attempts: failures,
            locked_until:
              failures >= MAX_LOGIN_FAILURES
                ? new Date(now.getTime() + LOCK_MINUTES * 60_000)
                : null,
          },
        });
      } else {
        await hashPassword(input.password);
      }
      await this.recordLogin(user?.id, input.username, 'failed', ip);
      throw new UnauthorizedException('Invalid username or password');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { failed_login_attempts: 0, locked_until: null },
      include: userAccessInclude,
    });
    await this.recordLogin(user.id, input.username, 'succeeded', ip);
    const tokens = await this.issueTokenPair(
      user.id,
      'admin',
      null,
      user.session_version,
    );
    return { ...tokens, user: await this.toUser(updated, 'admin', null) };
  }

  async changePassword(userId: string, input: ChangePasswordDto, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (
      !user?.password_hash ||
      !(await verifyPassword(user.password_hash, input.current_password))
    ) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const passwordHash = await hashPassword(input.new_password);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id: userId },
        data: {
          password_hash: passwordHash,
          must_change_password: false,
          session_version: { increment: 1 },
        },
        include: userAccessInclude,
      });
      await tx.refreshToken.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      await this.audit?.record(tx, {
        actorId: userId,
        action: 'staff.password.change',
        entityType: 'user',
        entityId: userId,
        ip,
      });
      return row;
    });
    const tokens = await this.issueTokenPair(
      updated.id,
      'admin',
      null,
      updated.session_version,
    );
    return {
      ...tokens,
      user: await this.toUser(updated, 'admin', null),
    };
  }

  async refresh(input: RefreshTokenDto) {
    const payload = await this.verifyRefresh(input.refresh_token);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
      include: { user: { include: userAccessInclude } },
    });
    const now = new Date();
    if (
      !stored ||
      stored.user_id !== payload.sub ||
      stored.surface !== payload.surface ||
      stored.session_version !== payload.ver ||
      stored.revoked_at ||
      stored.expires_at <= now ||
      !this.matchesHash(
        stored.token_hash,
        this.hashToken(input.refresh_token),
      ) ||
      !stored.user.is_active ||
      stored.user.session_version !== payload.ver ||
      (payload.surface === 'admin' && !stored.user.username) ||
      (payload.surface === 'app' && !this.canUseApp(stored.user))
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: { id: stored.id, revoked_at: null },
        data: { revoked_at: now },
      });
      if (revoked.count !== 1) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      return this.issueTokenPair(
        stored.user_id,
        payload.surface,
        payload.client ?? null,
        payload.ver,
        tx,
      );
    });
  }

  async logout(input: RefreshTokenDto): Promise<void> {
    const payload = await this.verifyRefresh(input.refresh_token);
    const revoked = await this.prisma.refreshToken.updateMany({
      where: {
        id: payload.jti,
        user_id: payload.sub,
        surface: payload.surface,
        token_hash: this.hashToken(input.refresh_token),
        revoked_at: null,
      },
      data: { revoked_at: new Date() },
    });
    if (revoked.count !== 1) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async verifyRefresh(token: string): Promise<RefreshPayload> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      if (
        payload.typ !== 'refresh' ||
        !payload.jti ||
        !['admin', 'app'].includes(payload.surface) ||
        !Number.isInteger(payload.ver)
      ) {
        throw new Error('invalid');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async issueTokenPair(
    userId: string,
    surface: AuthSurface,
    client: 'mobile' | 'web_store' | null,
    sessionVersion: number,
    database: Pick<PrismaService, 'refreshToken'> = this.prisma,
  ) {
    const accessSeconds = this.durationSeconds(
      this.config.get<string>('JWT_ACCESS_TTL', '15m'),
    );
    const refreshSeconds = this.durationSeconds(
      this.config.get<string>('JWT_REFRESH_TTL', '30d'),
    );
    const jti = randomUUID();
    const claims = {
      sub: userId,
      surface,
      ...(client ? { client } : {}),
      ver: sessionVersion,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { ...claims, typ: 'access' },
        {
          secret: this.config.getOrThrow<string>('JWT_SECRET'),
          expiresIn: accessSeconds,
        },
      ),
      this.jwt.signAsync(
        { ...claims, typ: 'refresh', jti },
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: refreshSeconds,
        },
      ),
    ]);
    await database.refreshToken.create({
      data: {
        id: jti,
        user_id: userId,
        token_hash: this.hashToken(refreshToken),
        surface,
        client,
        session_version: sessionVersion,
        expires_at: new Date(Date.now() + refreshSeconds * 1000),
      },
    });
    return { access_token: accessToken, refresh_token: refreshToken };
  }

  private async recordLogin(
    actorId: string | undefined,
    username: string,
    outcome: 'succeeded' | 'failed' | 'locked',
    ip?: string,
  ): Promise<void> {
    await this.audit?.record(this.prisma, {
      actorId,
      action: 'admin.login',
      entityType: 'admin_session',
      after: { username, outcome },
      ip,
    });
  }

  private canUseApp(user: AccessUser): boolean {
    return Boolean(
      user.phone &&
      user.role &&
      APP_ROLES.has(user.role.name) &&
      (!user.work_profile ||
        (user.work_profile.is_active &&
          user.work_profile.app_role === user.role.name)),
    );
  }

  private async toUser(
    user: AccessUser,
    surface: AuthSurface,
    client: 'mobile' | 'web_store' | null,
  ) {
    const permissions =
      surface === 'admin'
        ? ((await this.permissions?.resolve(
            user.id,
            user.permission_version,
          )) ?? [])
        : [];
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      username: user.username,
      email: user.email,
      is_active: user.is_active,
      role: surface === 'app' ? (user.role?.name ?? null) : null,
      permissions,
      permission_version: user.permission_version,
      must_change_password: user.must_change_password,
      surface,
      client,
      created_at: user.created_at,
    };
  }

  private hashOtp(phone: string, code: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update(`${phone}:${code}`)
      .digest('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private matchesHash(actual: string, expected: string): boolean {
    const actualBytes = Buffer.from(actual);
    const expectedBytes = Buffer.from(expected);
    return (
      actualBytes.length === expectedBytes.length &&
      timingSafeEqual(actualBytes, expectedBytes)
    );
  }

  private durationSeconds(value: string): number {
    const match = /^(\d+)(s|m|h|d)$/.exec(value);
    if (!match) throw new Error(`Invalid token TTL: ${value}`);
    const factors = { s: 1, m: 60, h: 3600, d: 86400 } as const;
    return Number(match[1]) * factors[match[2] as keyof typeof factors];
  }
}
