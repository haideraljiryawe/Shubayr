import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UserSelfUpdateDto } from './dto/user-self-update.dto';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';

const profileInclude = {
  role: true,
} as const;

type UserWithAccess = Awaited<
  ReturnType<PrismaService['user']['findUniqueOrThrow']>
> & {
  role: {
    name: string;
    role_permissions?: Array<{ permission: { key: string } }>;
  } | null;
};

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentUser(session: AuthenticatedRequestUser | string) {
    const userId = typeof session === 'string' ? session : session.id;
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: profileInclude,
    });
    return this.toResponse(user, session);
  }

  async updateCurrentUser(
    session: AuthenticatedRequestUser | string,
    input: UserSelfUpdateDto,
  ) {
    const userId = typeof session === 'string' ? session : session.id;
    const data: { name?: string; email?: string | null } = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.email !== undefined) {
      data.email = input.email === null ? null : input.email.trim();
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Provide name or email to update');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: profileInclude,
    });
    return this.toResponse(user, session);
  }

  private toResponse(
    user: UserWithAccess,
    session: AuthenticatedRequestUser | string,
  ) {
    const legacy = typeof session === 'string';
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      is_active: user.is_active,
      username: user.username,
      role:
        legacy || session.surface === 'app' ? (user.role?.name ?? null) : null,
      permissions: legacy
        ? (user.role?.role_permissions ?? []).map((row) => row.permission.key)
        : session.permissions,
      surface: legacy ? 'app' : session.surface,
      client: legacy ? null : session.client,
      created_at: user.created_at,
    };
  }
}
