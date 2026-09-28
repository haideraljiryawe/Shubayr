import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../database/prisma.service';
import type {
  AppRole,
  AuthSurface,
} from '../../common/decorators/access-policy.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { PermissionResolverService } from '../rbac/permission-resolver.service';

interface JwtPayload {
  sub: string;
  typ: string;
  surface: AuthSurface;
  client?: 'mobile' | 'web_store';
  ver: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionResolverService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedRequestUser> {
    if (
      payload.typ !== 'access' ||
      !['admin', 'app'].includes(payload.surface) ||
      !Number.isInteger(payload.ver)
    ) {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, is_active: true },
      include: { role: true, work_profile: true },
    });
    if (!user || user.session_version !== payload.ver) {
      throw new UnauthorizedException();
    }

    if (payload.surface === 'admin' && !user.username) {
      throw new UnauthorizedException();
    }
    const role = user.role?.name as AppRole | undefined;
    if (
      payload.surface === 'app' &&
      (!user.phone ||
        !role ||
        !['customer', 'delivery_agent', 'order_monitor'].includes(role) ||
        (user.work_profile &&
          (!user.work_profile.is_active ||
            user.work_profile.app_role !== role)))
    ) {
      throw new UnauthorizedException();
    }

    const permissions =
      payload.surface === 'admin'
        ? await this.permissions.resolve(user.id, user.permission_version)
        : [];

    return {
      id: user.id,
      phone: user.phone,
      username: user.username,
      role: payload.surface === 'app' ? (role ?? null) : null,
      surface: payload.surface,
      client: payload.client ?? null,
      permissions,
      permissionVersion: user.permission_version,
      sessionVersion: user.session_version,
      mustChangePassword: user.must_change_password,
    };
  }
}
