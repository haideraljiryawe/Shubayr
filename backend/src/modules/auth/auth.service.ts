import {
  Injectable,
  Logger,
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
import { PrismaService } from '../../database/prisma.service';
import { RefreshTokenDto, RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';
import { SmsGatewayService } from './sms-gateway.service';

const userAccessInclude = {
  role: {
    include: {
      role_permissions: { include: { permission: true } },
    },
  },
} as const;

type AccessUser = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  is_active: boolean;
  created_at: Date;
  role: {
    name: string;
    role_permissions: Array<{ permission: { key: string } }>;
  };
};

type RefreshPayload = {
  sub: string;
  typ: 'refresh';
  jti: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly sms: SmsGatewayService,
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
    const now = new Date();
    const otp = await this.prisma.otpCode.findFirst({
      where: {
        phone: input.phone,
        consumed_at: null,
        expires_at: { gt: now },
      },
      orderBy: { created_at: 'desc' },
    });
    if (
      !otp ||
      !this.matchesHash(otp.code_hash, this.hashOtp(input.phone, input.code))
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

      const customerRole = await tx.role.findUnique({
        where: { name: 'customer' },
      });
      if (!customerRole) {
        throw new ServiceUnavailableException('RBAC seed has not been applied');
      }
      return tx.user.upsert({
        where: { phone: input.phone },
        update: {},
        create: { phone: input.phone, role_id: customerRole.id },
        include: userAccessInclude,
      });
    });

    if (!user.is_active) throw new UnauthorizedException('Account is inactive');
    const tokens = await this.issueTokenPair(user.id);
    return { ...tokens, user: this.toUser(user) };
  }

  async refresh(input: RefreshTokenDto) {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(
        input.refresh_token,
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.typ !== 'refresh' || !payload.jti) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
      include: { user: { include: userAccessInclude } },
    });
    const now = new Date();
    if (
      !stored ||
      stored.user_id !== payload.sub ||
      stored.revoked_at ||
      stored.expires_at <= now ||
      !this.matchesHash(
        stored.token_hash,
        this.hashToken(input.refresh_token),
      ) ||
      !stored.user.is_active
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
      return this.issueTokenPair(stored.user_id, tx);
    });
  }

  private async issueTokenPair(
    userId: string,
    database: Pick<PrismaService, 'refreshToken'> = this.prisma,
  ) {
    const accessSeconds = this.durationSeconds(
      this.config.get<string>('JWT_ACCESS_TTL', '15m'),
    );
    const refreshSeconds = this.durationSeconds(
      this.config.get<string>('JWT_REFRESH_TTL', '30d'),
    );
    const jti = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: userId, typ: 'access' },
        {
          secret: this.config.getOrThrow<string>('JWT_SECRET'),
          expiresIn: accessSeconds,
        },
      ),
      this.jwt.signAsync(
        { sub: userId, typ: 'refresh', jti },
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
        expires_at: new Date(Date.now() + refreshSeconds * 1000),
      },
    });
    return { access_token: accessToken, refresh_token: refreshToken };
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

  private toUser(user: AccessUser) {
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      is_active: user.is_active,
      role: user.role.name,
      permissions: user.role.role_permissions.map(
        ({ permission }) => permission.key,
      ),
      created_at: user.created_at,
    };
  }
}
