import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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

  async deleteCustomerAccount(userId: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
        const user = await tx.user.findUnique({
          where: { id: userId },
          include: { role: true },
        });
        if (
          !user ||
          !user.is_active ||
          user.anonymized_at ||
          user.role?.name !== 'customer'
        ) {
          throw new NotFoundException('Customer account not found');
        }

        const [openOrders, pendingReturns, refundObligations, openCollections] =
          await Promise.all([
            tx.order.count({
              where: {
                user_id: userId,
                status: {
                  notIn: ['rejected', 'cancelled', 'delivered', 'returned'],
                },
              },
            }),
            tx.return.count({
              where: {
                user_id: userId,
                status: {
                  in: ['requested', 'approved', 'partially_approved'],
                },
              },
            }),
            tx.refundLedgerEntry.count({
              where: {
                order: { is: { user_id: userId } },
                status: 'obligation',
              },
            }),
            tx.deliveryCollection.count({
              where: {
                order: { is: { user_id: userId } },
                status: { in: ['unconfirmed', 'confirmed_short'] },
              },
            }),
          ]);
        const unsettledAmounts = refundObligations + openCollections;
        if (openOrders || pendingReturns || unsettledAmounts) {
          throw new ConflictException({
            status: 409,
            code: 'ACCOUNT_DELETION_BLOCKED',
            message:
              'Resolve open orders, pending returns, and unsettled amounts before deleting the account',
            errors: [
              ...(openOrders
                ? [
                    {
                      field: 'open_orders',
                      code: 'OPEN_ORDERS',
                      message: `${openOrders} open order(s) remain`,
                    },
                  ]
                : []),
              ...(pendingReturns
                ? [
                    {
                      field: 'pending_returns',
                      code: 'PENDING_RETURNS',
                      message: `${pendingReturns} pending return(s) remain`,
                    },
                  ]
                : []),
              ...(unsettledAmounts
                ? [
                    {
                      field: 'unsettled_amounts',
                      code: 'UNSETTLED_AMOUNTS',
                      message: `${unsettledAmounts} unsettled financial record(s) remain`,
                    },
                  ]
                : []),
            ],
          });
        }

        const now = new Date();
        await this.audit.record(tx, {
          actorId: userId,
          action: 'customer.account_delete',
          entityType: 'user',
          entityId: userId,
          before: {
            active: true,
            has_name: Boolean(user.name),
            has_phone: Boolean(user.phone),
            has_email: Boolean(user.email),
          },
          after: {
            anonymized: true,
            sessions_revoked: true,
            addresses_removed: true,
            devices_removed: true,
          },
        });
        await tx.address.deleteMany({ where: { user_id: userId } });
        await tx.deviceToken.deleteMany({ where: { user_id: userId } });
        await tx.refreshToken.deleteMany({ where: { user_id: userId } });
        if (user.phone) {
          await tx.otpCode.deleteMany({ where: { phone: user.phone } });
        }
        await tx.user.update({
          where: { id: userId },
          data: {
            name: null,
            phone: null,
            email: null,
            username: null,
            password_hash: null,
            must_change_password: false,
            failed_login_attempts: 0,
            locked_until: null,
            is_active: false,
            anonymized_at: now,
            session_version: { increment: 1 },
            permission_version: { increment: 1 },
            updated_at: now,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15_000,
      },
    );
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
      must_change_password: legacy
        ? user.must_change_password
        : session.mustChangePassword,
      permission_version: legacy
        ? user.permission_version
        : session.permissionVersion,
      created_at: user.created_at,
    };
  }
}
