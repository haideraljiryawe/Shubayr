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
import { presetPresentation } from '../../common/access/permission-registry';
import { setTimeout as delay } from 'node:timers/promises';

const profileInclude = {
  role: true,
  permission_presets: { include: { preset: true } },
} satisfies Prisma.UserInclude;

type UserWithAccess = Prisma.UserGetPayload<{
  include: typeof profileInclude;
}> & {
  role:
    | (Prisma.UserGetPayload<{ include: { role: true } }>['role'] & {
        role_permissions?: Array<{ permission: { key: string } }>;
      })
    | null;
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
    const data: {
      name?: string;
      email?: string | null;
      preferred_ui_language?: 'ar' | 'en';
    } = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.email !== undefined) {
      data.email = input.email === null ? null : input.email.trim();
    }
    if (input.preferred_ui_language !== undefined) {
      data.preferred_ui_language = input.preferred_ui_language;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'Provide name, email, or preferred_ui_language to update',
      );
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: profileInclude,
    });
    return this.toResponse(user, session);
  }

  async deleteCustomerAccount(userId: string): Promise<void> {
    // A cancellation and its inbox/outbox work can overlap this deletion.
    // Retry the entire locked check from a fresh transaction on a transient
    // database conflict; never retry only the anonymization half.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        await this.deleteCustomerAccountOnce(userId);
        return;
      } catch (error) {
        if (!this.isRetryableDeletionConflict(error)) throw error;
        if (attempt === 7) {
          throw new ConflictException({
            status: 409,
            code: 'ACCOUNT_DELETION_BLOCKED',
            message:
              'Resolve open orders, pending returns, and unsettled amounts before deleting the account',
            details: {
              open_orders: 0,
              pending_returns: 0,
              unsettled_amounts: 0,
            },
            errors: [],
          });
        }
        // Let an in-flight order transition release its locks before retrying.
        await delay(
          Math.min(10 * 2 ** attempt, 100) + Math.floor(Math.random() * 20),
        );
      }
    }
  }

  private isRetryableDeletionConflict(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    // The pg driver adapter exposes some PostgreSQL 40001/40P01 failures as
    // DriverAdapterError rather than Prisma's P2034.
    if ('cause' in error && error.cause && typeof error.cause === 'object') {
      if (
        'kind' in error.cause &&
        error.cause.kind === 'TransactionWriteConflict'
      )
        return true;
    }
    if (!('code' in error)) return false;
    if (error.code === 'P2034') return true;
    if (error.code !== 'P2010') return false;
    const meta = 'meta' in error ? error.meta : undefined;
    if (
      typeof meta === 'object' &&
      meta !== null &&
      'code' in meta &&
      (String(meta.code) === '40001' ||
        String(meta.code) === '40P01' ||
        String(meta.code) === '55P03')
    )
      return true;
    // Raw SELECT FOR UPDATE errors can arrive without the SQLSTATE in meta.
    return (
      'message' in error &&
      typeof error.message === 'string' &&
      /could not serialize access|deadlock detected|could not obtain lock on row/i.test(
        error.message,
      )
    );
  }

  private async deleteCustomerAccountOnce(userId: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
        // Checkout also locks the user before creating an order. Lock all of
        // this customer's existing orders before reading terminal states or
        // deleting addresses; NOWAIT turns another order transition into the
        // existing retry/409 path instead of a lock-order deadlock.
        await tx.$queryRaw`SELECT id FROM orders WHERE user_id = ${userId}::uuid ORDER BY id FOR UPDATE NOWAIT`;
        const user = await tx.user.findUnique({
          where: { id: userId },
          include: { role: true },
        });
        if (!user || user.role?.name !== 'customer') {
          throw new NotFoundException('Customer account not found');
        }
        // A second request that passed authentication before the first one
        // committed waits for the same row lock and completes idempotently.
        if (user.anonymized_at) return;
        if (!user.is_active)
          throw new NotFoundException('Customer account not found');

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
            details: {
              open_orders: openOrders,
              pending_returns: pendingReturns,
              unsettled_amounts: unsettledAmounts,
            },
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
        await tx.notificationEvent.updateMany({
          where: { user_id: userId, processed_at: null },
          data: { processed_at: now },
        });
        await tx.notificationLog.updateMany({
          where: {
            user_id: userId,
            status: { in: ['queued', 'sending', 'failed'] },
          },
          data: {
            status: 'skipped',
            error: 'ACCOUNT_DELETED',
            error_code: 'ACCOUNT_DELETED',
            lease_until: null,
          },
        });
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
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 15_000,
      },
    );
  }

  private toResponse(
    user: UserWithAccess,
    session: AuthenticatedRequestUser | string,
  ) {
    const legacy = typeof session === 'string';
    const adminPresets =
      !legacy && session.surface === 'admin'
        ? {
            presets: user.permission_presets.map(({ preset }) => ({
              id: preset.id,
              name: preset.name,
              ...presetPresentation(preset.name),
            })),
          }
        : {};
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
      preferred_ui_language: user.preferred_ui_language,
      created_at: user.created_at,
      ...adminPresets,
    };
  }
}
