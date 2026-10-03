import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class OrderTimeoutService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(OrderTimeoutService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.run(), 30_000);
    this.timer.unref();
    void this.run();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      const candidates = await this.prisma.order.findMany({
        where: {
          status: 'pending',
          OR: [
            { auto_cancel_deadline: { lte: now } },
            {
              acceptance_deadline: { lte: now },
              acceptance_alerted_at: null,
            },
          ],
        },
        select: { id: true },
        orderBy: { placed_at: 'asc' },
        take: 100,
      });
      for (const candidate of candidates) {
        await this.process(candidate.id, now);
      }
    } catch (error) {
      this.logger.warn(`Order timeout scan failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async process(id: string, now: Date) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id } });
      if (!order || order.status !== 'pending') return;
      if (order.auto_cancel_deadline && order.auto_cancel_deadline <= now) {
        const changed = await tx.order.updateMany({
          where: { id, status: 'pending', version: order.version },
          data: { status: 'cancelled', version: { increment: 1 } },
        });
        if (!changed.count) return;
        await tx.orderStatusEvent.create({
          data: {
            order_id: id,
            status: 'cancelled',
            note: 'Automatically cancelled after the business-hours timeout',
            at: now,
          },
        });
        await this.inventory.releaseOrder(tx, id);
        await this.audit.record(tx, {
          action: 'order.auto_cancel',
          entityType: 'order',
          entityId: id,
          before: { status: 'pending', version: order.version },
          after: { status: 'cancelled', version: order.version + 1 },
        });
        await this.notifications.record(
          tx,
          order.user_id,
          'order_cancelled',
          'order',
          id,
          `timeout:${order.version}`,
        );
        await this.notifications.recordStaffWithPermission(
          tx,
          'orders.view',
          'order_cancelled',
          'order',
          id,
          `timeout:${order.version}`,
        );
        return;
      }
      if (
        order.acceptance_deadline &&
        order.acceptance_deadline <= now &&
        !order.acceptance_alerted_at
      ) {
        await tx.order.update({
          where: { id },
          data: { late_for_acceptance: true, acceptance_alerted_at: now },
        });
        await this.audit.record(tx, {
          action: 'order.acceptance_late',
          entityType: 'order',
          entityId: id,
          before: { late_for_acceptance: false },
          after: { late_for_acceptance: true },
        });
        await this.notifications.recordStaffWithPermission(
          tx,
          'orders.accept',
          'order_acceptance_late',
          'order',
          id,
          order.acceptance_deadline.toISOString(),
        );
      }
    });
  }
}
