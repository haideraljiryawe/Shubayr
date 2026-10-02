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
import { InventoryService } from '../inventory/inventory.service';
import { AssignedDeliveriesQueryDto } from './dto/assigned-deliveries-query.dto';
import { DeliveryAgentsQueryDto } from './dto/delivery-agents-query.dto';
import {
  AssignDeliveryDto,
  CreateDeliveryRatingDto,
  UpdateStaffDeliveryStatusDto,
  UpdateDeliveryStatusDto,
} from './dto/delivery.dto';
import { assertOrderTransition, staleOrder } from '../orders/order-transition';

const transitions: Record<string, readonly string[]> = {
  assigned: ['out_for_delivery'],
  out_for_delivery: ['delivered', 'failed'],
  delivered: ['returned'],
  failed: ['out_for_delivery'],
  returned: [],
};

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
    private readonly audit: AuditService,
    private readonly notifications?: NotificationsService,
    private readonly inventory: InventoryService = undefined as unknown as InventoryService,
  ) {}

  listAssigned(agentId: string, query: AssignedDeliveriesQueryDto) {
    return this.list({ agent_id: agentId }, query);
  }

  listAll(query: AssignedDeliveriesQueryDto) {
    return this.list({}, query);
  }

  async listAgents(query: DeliveryAgentsQueryDto) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const q = query.q?.trim();
    const where: Prisma.UserWhereInput = {
      is_active: true,
      role: { is: { name: 'delivery_agent' } },
      work_profile: {
        is: { app_role: 'delivery_agent', is_active: true },
      },
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { phone: { contains: q } },
              {
                work_profile: {
                  is: {
                    name: { contains: q, mode: 'insensitive' as const },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          phone: true,
          work_profile: { select: { name: true } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return {
      page,
      per_page: perPage,
      total,
      data: rows.map((row) => ({
        id: row.id,
        name: row.work_profile?.name ?? row.name ?? '',
        phone: row.phone ?? '',
      })),
    };
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
      await this.notifications?.record(
        tx,
        input.agent_id,
        'delivery_assigned',
        'delivery',
        id,
        input.agent_id,
        'delivery_agent',
      );
      return updated;
    });
    return this.present(row);
  }

  async updateStatus(
    agentId: string,
    id: string,
    input: UpdateDeliveryStatusDto,
  ) {
    return this.transitionStatus(agentId, id, input, true);
  }

  async updateStatusAsStaff(
    actorId: string,
    id: string,
    input: UpdateStaffDeliveryStatusDto,
  ) {
    return this.transitionStatus(actorId, id, input, false, true);
  }

  private async transitionStatus(
    actorId: string,
    id: string,
    input: UpdateDeliveryStatusDto | UpdateStaffDeliveryStatusDto,
    assignedAgentOnly: boolean,
    retryOnlyForDispatch = false,
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
      if (assignedAgentOnly && delivery.agent_id !== actorId) {
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
      if (
        retryOnlyForDispatch &&
        input.status === 'out_for_delivery' &&
        delivery.status !== 'failed'
      ) {
        throw new ConflictException('Staff dispatch retry requires a failure');
      }

      if (delivery.order.version !== input.order_version) {
        throw staleOrder(delivery.order.status, delivery.order.version);
      }

      const orderStatus = delivery.order.status;
      let orderSteps: string[];
      switch (input.status) {
        case 'out_for_delivery': {
          if (!['ready_for_dispatch', 'failed'].includes(orderStatus)) {
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
        const priorStatus = index === 0 ? orderStatus : orderSteps[index - 1];
        assertOrderTransition(
          priorStatus,
          status,
          delivery.order.version + index,
          input.order_version + index,
        );
        const changed = await tx.order.updateMany({
          where: {
            id: delivery.order_id,
            status: priorStatus,
            version: input.order_version + index,
          },
          data: { status, version: { increment: 1 } },
        });
        if (!changed.count) {
          const current = await tx.order.findUniqueOrThrow({
            where: { id: delivery.order_id },
          });
          throw staleOrder(current.status, current.version);
        }
        await tx.orderStatusEvent.create({
          data: {
            order_id: delivery.order_id,
            status,
            note: `Delivery ${id} status changed by assigned agent`,
            at: new Date(now.getTime() + index),
          },
        });
        await this.audit.record(tx, {
          actorId,
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
      if (
        input.status === 'out_for_delivery' &&
        delivery.status === 'assigned'
      ) {
        await this.inventory.issueOrderToCustody(
          tx,
          delivery.order_id,
          id,
          delivery.agent_id!,
          actorId,
        );
      }
      if (input.status === 'delivered') {
        await this.inventory.settleCustodyToSold(
          tx,
          delivery.order_id,
          delivery.agent_id!,
        );
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
            actorId,
            action: 'payment.reconcile_cod',
            entityType: 'payment',
            entityId: payment.id,
            before: { status: payment.status, paid_at: payment.paid_at },
            after: { status: 'paid', paid_at: now.toISOString() },
          });
        }
        await this.loyalty.earnDelivered(tx, delivery.order_id, actorId);
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
        'customer',
        `/orders/${delivery.order_id}`,
      );
      if (input.status === 'failed') {
        await this.notifications?.recordOrderMonitors(
          tx,
          'delivery_failed',
          delivery.order_id,
          id,
        );
      }
      const updated = await tx.delivery.update({
        where: { id },
        data: {
          status: input.status,
          ...(input.status === 'out_for_delivery'
            ? { dispatched_at: now }
            : {}),
          ...(input.status === 'delivered' ? { delivered_at: now } : {}),
          ...(input.status === 'failed'
            ? { failure_reason: input.reason, failed_at: now }
            : {}),
          ...(input.status === 'out_for_delivery' &&
          delivery.status === 'failed'
            ? {
                retry_count: { increment: 1 },
                failure_reason: null,
              }
            : {}),
        },
      });
      await this.audit.record(tx, {
        actorId,
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
    return {
      id: row.id,
      order_id: row.order_id,
      agent_id: row.agent_id,
      status: row.status,
      delivery_fee: Number(row.delivery_fee),
      currency: row.currency_code,
      dispatched_at: row.dispatched_at,
      delivered_at: row.delivered_at,
      failure_reason: row.failure_reason,
      failed_at: row.failed_at,
      retry_count: row.retry_count,
    };
  }
}
