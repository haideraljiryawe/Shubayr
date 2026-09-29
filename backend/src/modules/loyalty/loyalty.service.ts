import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { minorUnitsToMoney, moneyToMinorUnits } from '../catalog/pricing';
import {
  AdjustPointsDto,
  LoyaltyQueryDto,
  RedeemPointsDto,
} from './dto/loyalty.dto';

@Injectable()
export class LoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly notifications?: NotificationsService,
  ) {}

  /** Call inside the order-delivery transaction, after status becomes delivered. */
  async earnDelivered(
    tx: Prisma.TransactionClient,
    orderId: string,
    actorId: string,
  ) {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status !== 'delivered')
      throw new ConflictException('Order is not delivered');
    const existing = await tx.loyaltyLedger.findFirst({
      where: { order_id: orderId, type: 'earn' },
    });
    if (existing) return existing;
    const rate = this.config.get<number>('LOYALTY_POINTS_PER_CURRENCY_UNIT', 1);
    const eligibleMinor =
      moneyToMinorUnits(order.subtotal) - moneyToMinorUnits(order.discount);
    const pointsBig = (eligibleMinor > 0n ? eligibleMinor : 0n) * BigInt(rate);
    if (pointsBig === 0n) return null;
    if (pointsBig > 2_147_483_647n)
      throw new UnprocessableEntityException(
        'Earned points exceed ledger limit',
      );
    const account = await this.lockAccount(tx, order.user_id);
    const entry = await tx.loyaltyLedger.create({
      data: {
        account_id: account.id,
        order_id: order.id,
        type: 'earn',
        reason: 'order_delivered',
        points: Number(pointsBig),
        created_by: actorId,
        note: `${rate} point(s) per full currency unit of order subtotal less discount; delivery fee excluded`,
      },
    });
    await this.audit.record(tx, {
      actorId,
      action: 'loyalty.earn',
      entityType: 'loyalty_ledger',
      entityId: entry.id,
      after: {
        user_id: order.user_id,
        order_id: order.id,
        points: entry.points,
      },
    });
    await this.notifications?.record(
      tx,
      order.user_id,
      'loyalty_points_earned',
      'loyalty_ledger',
      entry.id,
    );
    return entry;
  }

  async own(userId: string, query: LoyaltyQueryDto) {
    return this.history(userId, query);
  }

  async staff(userId: string, query: LoyaltyQueryDto) {
    await this.requireCustomer(this.prisma, userId);
    return this.history(userId, query);
  }

  private async history(userId: string, query: LoyaltyQueryDto) {
    const page = query.page ?? 1;
    const per_page = query.per_page ?? 20;
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { user_id: userId },
    });
    if (!account)
      return {
        user_id: userId,
        points_balance: 0,
        page,
        per_page,
        total: 0,
        ledger: [],
      };
    const [sum, total, entries] = await this.prisma.$transaction([
      this.prisma.loyaltyLedger.aggregate({
        where: { account_id: account.id },
        _sum: { points: true },
      }),
      this.prisma.loyaltyLedger.count({ where: { account_id: account.id } }),
      this.prisma.loyaltyLedger.findMany({
        where: { account_id: account.id },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * per_page,
        take: per_page,
      }),
    ]);
    return {
      user_id: userId,
      points_balance: sum._sum.points ?? 0,
      page,
      per_page,
      total,
      ledger: entries,
    };
  }

  async redeem(userId: string, input: RedeemPointsDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const account = await this.lockAccount(tx, userId);
      const balance = await this.balance(tx, account.id);
      if (input.points > balance)
        throw new ConflictException('Insufficient loyalty points');
      const entry = await tx.loyaltyLedger.create({
        data: {
          account_id: account.id,
          type: 'redeem',
          reason: 'customer_redemption',
          points: -input.points,
          created_by: userId,
          note: input.note ?? null,
        },
      });
      await this.audit.record(tx, {
        actorId: userId,
        action: 'loyalty.redeem',
        entityType: 'loyalty_ledger',
        entityId: entry.id,
        after: {
          user_id: userId,
          points: entry.points,
          balance: balance - input.points,
        },
      });
      return {
        entry,
        points_balance: balance - input.points,
        redemption_value: minorUnitsToMoney(BigInt(input.points)),
      };
    });
    return result;
  }

  async adjust(actorId: string, userId: string, input: AdjustPointsDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireCustomer(tx, userId);
      const account = await this.lockAccount(tx, userId);
      const balance = await this.balance(tx, account.id);
      if (balance + input.points < 0)
        throw new ConflictException('Adjustment would make balance negative');
      const entry = await tx.loyaltyLedger.create({
        data: {
          account_id: account.id,
          type: 'adjust',
          reason: input.reason.trim(),
          points: input.points,
          created_by: actorId,
          note: input.note ?? null,
        },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'loyalty.adjust',
        entityType: 'loyalty_ledger',
        entityId: entry.id,
        after: {
          user_id: userId,
          reason: entry.reason,
          points: entry.points,
          balance: balance + input.points,
        },
      });
      return { entry, points_balance: balance + input.points };
    });
  }

  private async lockAccount(tx: Prisma.TransactionClient, userId: string) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    return tx.loyaltyAccount.upsert({
      where: { user_id: userId },
      update: {},
      create: { user_id: userId },
    });
  }

  private async balance(tx: Prisma.TransactionClient, accountId: string) {
    const row = await tx.loyaltyLedger.aggregate({
      where: { account_id: accountId },
      _sum: { points: true },
    });
    return row._sum.points ?? 0;
  }

  private async requireCustomer(
    db: Pick<Prisma.TransactionClient, 'user'>,
    userId: string,
  ) {
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user || user.role?.name !== 'customer')
      throw new NotFoundException('Customer not found');
  }
}
