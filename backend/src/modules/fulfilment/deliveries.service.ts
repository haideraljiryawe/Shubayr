import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Delivery, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AssignedDeliveriesQueryDto } from './dto/assigned-deliveries-query.dto';
import {
  AssignDeliveryDto,
  CreateDeliveryRatingDto,
  UpdateDeliveryStatusDto,
} from './dto/delivery.dto';

const transitions: Record<string, readonly string[]> = {
  assigned: ['out_for_delivery'],
  out_for_delivery: ['delivered', 'failed'],
  delivered: ['returned'],
  failed: [],
  returned: [],
};

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
    private readonly audit: AuditService,
    private readonly notifications?: NotificationsService,
  ) {}

  listAssigned(agentId: string, query: AssignedDeliveriesQueryDto) {
    return this.list({ agent_id: agentId }, query);
  }

  listAll(query: AssignedDeliveriesQueryDto) {
    return this.list({}, query);
  }

  private async list(
    scope: Prisma.DeliveryWhereInput,
    query: AssignedDeliveriesQueryDto,
  ) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const where: Prisma.DeliveryWhereInput = {
      ...scope,
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.delivery.count({ where }),
      this.prisma.delivery.findMany({
        where,
        orderBy: [{ dispatched_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return {
      page,
      per_page: perPage,
      total,
      data: rows.map((row) => this.present(row)),
    };
  }

  async assign(actorId: string, id: string, input: AssignDeliveryDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const agent = await tx.user.findUnique({
        where: { id: input.agent_id },
        include: { role: true },
      });
      if (!agent || !agent.is_active || agent.role?.name !== 'delivery_agent') {
        throw new NotFoundException('Delivery agent not found');
      }
      const initial = await tx.delivery.findUnique({ where: { id } });
      if (!initial) throw new NotFoundException('Delivery not found');
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${initial.order_id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM deliveries WHERE id = ${id}::uuid FOR UPDATE`;
      const delivery = await tx.delivery.findUnique({
        where: { id },
        include: { order: true },
      });
      if (!delivery) throw new NotFoundException('Delivery not found');
      if (delivery.order.delivery_id !== id) {
        throw new ConflictException('Delivery is not current for the order');
      }
      if (!['assigned', 'out_for_delivery'].includes(delivery.status)) {
        throw new ConflictException('Terminal delivery cannot be reassigned');
      }
      if (
        ![
          'pending',
          'confirmed',
          'preparing',
          'ready_for_dispatch',
          'dispatched',
        ].includes(delivery.order.status)
      ) {
        throw new ConflictException('Order delivery is not active');
      }
      const updated = await tx.delivery.update({
        where: { id },
        data: { agent_id: input.agent_id },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'delivery.assign',
        entityType: 'delivery',
        entityId: id,
        before: { agent_id: delivery.agent_id },
        after: { agent_id: input.agent_id },
      });
      return updated;
    });
    return this.present(row);
  }

  async updateStatus(
    agentId: string,
    id: string,
    input: UpdateDeliveryStatusDto,
  ) {
    const row = await this.prisma.$transaction(async (tx) => {
      const initial = await tx.delivery.findUnique({ where: { id } });
      if (!initial) throw new NotFoundException('Delivery not found');
      // Order first, then delivery: staff order transitions lock in this order.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${initial.order_id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM deliveries WHERE id = ${id}::uuid FOR UPDATE`;
      const delivery = await tx.delivery.findUnique({
        where: { id },
        include: { order: true },
      });
      if (!delivery) throw new NotFoundException('Delivery not found');
      if (delivery.agent_id !== agentId) {
        throw new ForbiddenException('Delivery is assigned to another agent');
      }
      if (delivery.order.delivery_id !== id) {
        throw new ConflictException('Delivery is not current for the order');
      }
      if (!transitions[delivery.status]?.includes(input.status)) {
        throw new ConflictException(
          'Delivery status transition is not allowed',
        );
      }

      const orderStatus = delivery.order.status;
      let orderSteps: string[];
      switch (input.status) {
        case 'out_for_delivery': {
          if (orderStatus !== 'ready_for_dispatch') {
            throw new ConflictException('Order cannot be dispatched');
          }
          orderSteps = ['dispatched'];
          break;
        }
        case 'delivered':
        case 'failed':
          if (orderStatus !== 'dispatched') {
            throw new ConflictException('Order is not out for delivery');
          }
          orderSteps = [input.status === 'failed' ? 'failed' : 'delivered'];
          break;
        case 'returned':
          if (!['delivered', 'return_requested'].includes(orderStatus)) {
            throw new ConflictException('Order cannot be returned');
          }
          orderSteps =
            orderStatus === 'delivered'
              ? ['return_requested', 'returned']
              : ['returned'];
          break;
      }

      const now = new Date();
      for (const [index, status] of orderSteps.entries()) {
        await tx.order.update({
          where: { id: delivery.order_id },
          data: { status },
        });
        await tx.orderStatusEvent.create({
          data: {
            order_id: delivery.order_id,
            status,
            note: `Delivery ${id} status changed by assigned agent`,
            at: new Date(now.getTime() + index),
          },
        });
        await this.audit.record(tx, {
          actorId: agentId,
          action:
            status === 'dispatched' ? 'order.dispatch' : 'order.transition',
          entityType: 'order',
          entityId: delivery.order_id,
          before: {
            status: index === 0 ? orderStatus : orderSteps[index - 1],
          },
          after: { status, delivery_id: id },
        });
      }
      if (input.status === 'out_for_delivery') {
        await tx.simpleStockHold.updateMany({
          where: { order_id: delivery.order_id, status: 'held' },
          data: { status: 'deducted', deducted_at: now },
        });
      }
      if (input.status === 'delivered') {
        const payments = await tx.payment.findMany({
          where: {
            order_id: delivery.order_id,
            method: 'cod',
            status: 'pending',
          },
        });
        for (const payment of payments) {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'paid', paid_at: now },
          });
          await this.audit.record(tx, {
            actorId: agentId,
            action: 'payment.reconcile_cod',
            entityType: 'payment',
            entityId: payment.id,
            before: { status: payment.status, paid_at: payment.paid_at },
            after: { status: 'paid', paid_at: now.toISOString() },
          });
        }
        await this.loyalty.earnDelivered(tx, delivery.order_id, agentId);
      }
      await this.notifications?.record(
        tx,
        delivery.order.user_id,
        input.status === 'failed'
          ? 'delivery_failed'
          : input.status === 'returned'
            ? 'return_update'
            : input.status,
        'delivery',
        id,
        input.status,
      );
      const updated = await tx.delivery.update({
        where: { id },
        data: {
          status: input.status,
          ...(input.status === 'out_for_delivery'
            ? { dispatched_at: now }
            : {}),
          ...(input.status === 'delivered' ? { delivered_at: now } : {}),
        },
      });
      await this.audit.record(tx, {
        actorId: agentId,
        action: 'delivery.transition',
        entityType: 'delivery',
        entityId: id,
        before: { status: delivery.status },
        after: { status: input.status },
      });
      return updated;
    });
    return this.present(row);
  }

  async rate(
    userId: string,
    role: string,
    id: string,
    input: CreateDeliveryRatingDto,
  ) {
    if (role !== 'customer')
      throw new ForbiddenException('Customer account required');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const delivery = await tx.delivery.findUnique({
          where: { id },
          include: { order: true },
        });
        if (!delivery || delivery.order.user_id !== userId) {
          throw new NotFoundException('Delivery not found');
        }
        const existing = await tx.deliveryRating.findUnique({
          where: { delivery_id: id },
        });
        if (existing) throw new ConflictException('Delivery already rated');
        if (
          delivery.status !== 'delivered' ||
          delivery.order.status !== 'delivered'
        ) {
          throw new ConflictException('Delivery is not delivered');
        }
        return tx.deliveryRating.create({
          data: {
            delivery_id: id,
            agent_id: delivery.agent_id,
            user_id: userId,
            stars: input.stars,
            comment: input.comment ?? null,
          },
        });
      });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Delivery already rated');
      }
      throw error;
    }
  }

  private present(row: Delivery) {
    return { ...row, delivery_fee: Number(row.delivery_fee) };
  }
}
