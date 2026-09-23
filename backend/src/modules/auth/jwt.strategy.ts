import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../database/prisma.service';

interface JwtPayload {
  sub: string;
  typ: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<{
    id: string;
    phone: string;
    role: string;
    permissions: string[];
  }> {
    if (payload.typ !== 'access') throw new UnauthorizedException();
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, is_active: true },
      include: {
        role: {
          include: {
            role_permissions: { include: { permission: true } },
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException();

    return {
      id: user.id,
      phone: user.phone,
      role: user.role.name,
      permissions: user.role.role_permissions.map(
        ({ permission }) => permission.key,
      ),
    };
  }
}
