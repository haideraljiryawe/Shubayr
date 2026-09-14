import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UserSelfUpdateDto } from './dto/user-self-update.dto';

const profileInclude = {
  role: {
    include: {
      role_permissions: { include: { permission: true } },
    },
  },
} as const;

type UserWithAccess = Awaited<
  ReturnType<PrismaService['user']['findUniqueOrThrow']>
> & {
  role: {
    name: string;
    role_permissions: Array<{ permission: { key: string } }>;
  };
};

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async updateCurrentUser(userId: string, input: UserSelfUpdateDto) {
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
    return this.toResponse(user);
  }

  private toResponse(user: UserWithAccess) {
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
