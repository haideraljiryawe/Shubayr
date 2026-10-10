import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Delivery, Prisma } from '../../generated/prisma/client';
import { Prisma as PrismaRuntime } from '../../generated/prisma/client';
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
  ConfirmDeliveryCollectionDto,
  UnconfirmedDeliveriesQueryDto,
  PartyCollectionsQueryDto,
} from './dto/delivery.dto';
import { assertOrderTransition, staleOrder } from '../orders/order-transition';
import { LedgerService, type PostingLine } from '../finance/ledger.service';
import { OperationService } from '../finance/operation.service';
import {
  businessDate,
  businessDateText,
  businessDayEnd,
  businessDayStart,
} from '../finance/business-date';
import {
  materializeDeliveryPosting,
  type DeliveryPostingAmounts,
  type DeliveryPostingScenario,
} from '../finance/posting-scenarios';
import { ExternalDriverTripHistoryService } from './external-driver-trip-history.service';

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
    private readonly ledger: LedgerService = undefined as unknown as LedgerService,
    private readonly operations: OperationService = undefined as unknown as OperationService,
    private readonly tripHistory?: ExternalDriverTripHistoryService,
  ) {}

  listAssigned(agentId: string, query: AssignedDeliveriesQueryDto) {
    return this.list({ party: { is: { user_id: agentId } } }, query);
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
        include: {
          order: { select: { version: true, total: true } },
          party: {
            select: {
              id: true,
              kind: true,
              user_id: true,
              name: true,
              phone: true,
            },
          },
          attempts: {
            include: { party: { select: { id: true, name: true } } },
            orderBy: { attempt_number: 'asc' },
          },
          collection: true,
        },
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
    if (Boolean(input.agent_id) === Boolean(input.party_id)) {
      throw new UnprocessableEntityException(
        'Provide exactly one of agent_id or party_id',
      );
    }
    const partyId = input.party_id ?? input.agent_id!;
    const row = await this.prisma.$transaction(async (tx) => {
      const party = await tx.deliveryParty.findUnique({
        where: { id: partyId },
        include: { user: { include: { role: true, work_profile: true } } },
      });
      if (
        !party ||
        !party.is_active ||
        (party.kind === 'internal_agent' &&
          (!party.user?.is_active ||
            party.user.role?.name !== 'delivery_agent' ||
            !party.user.work_profile?.is_active))
      ) {
        throw new NotFoundException('Active delivery party not found');
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
        data: { agent_id: partyId },
        include: {
          order: { select: { version: true, total: true } },
          party: {
            select: {
              id: true,
              kind: true,
              user_id: true,
              name: true,
              phone: true,
            },
          },
          attempts: {
            include: { party: { select: { id: true, name: true } } },
            orderBy: { attempt_number: 'asc' },
          },
          collection: true,
        },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'delivery.assign',
        entityType: 'delivery',
        entityId: id,
        before: { agent_id: delivery.agent_id },
        after: { party_id: partyId },
      });
      if (party.user_id) {
        await this.notifications?.record(
          tx,
          party.user_id,
          'delivery_assigned',
          'delivery',
          id,
          party.user_id,
          'delivery_agent',
        );
      }
      return updated;
    });
    return this.present(row);
  }

  async updateStatus(
    agentId: string,
    id: string,
    input: UpdateDeliveryStatusDto,
  ) {
    if (input.status === 'delivered') {
      return this.operations.execute({
        userId: agentId,
        operationId: input.operation_id!,
        endpoint: `PATCH /deliveries/${id}`,
        payload: input,
        work: (tx) =>
          this.transitionStatus(agentId, id, input, true, false, tx),
      });
    }
    return this.transitionStatus(agentId, id, input, true);
  }

  async updateStatusAsStaff(
    actorId: string,
    id: string,
    input: UpdateStaffDeliveryStatusDto,
  ) {
    if (input.status === 'delivered') {
      return this.operations.execute({
        userId: actorId,
        operationId: input.operation_id!,
        endpoint: `PATCH /admin/deliveries/${id}/status`,
        payload: input,
        work: (tx) =>
          this.transitionStatus(actorId, id, input, false, true, tx),
      });
    }
    return this.transitionStatus(actorId, id, input, false, true);
  }

  async transitionStatus(
    actorId: string,
    id: string,
    input: UpdateDeliveryStatusDto | UpdateStaffDeliveryStatusDto,
    assignedAgentOnly: boolean,
    retryOnlyForDispatch = false,
    transaction?: Prisma.TransactionClient,
    recordedAt?: Date,
    tripEvent: { record?: boolean; expectedTripId?: string } = {},
  ) {
    const work = async (tx: Prisma.TransactionClient) => {
      const initial = await tx.delivery.findUnique({ where: { id } });
      if (!initial) throw new NotFoundException('Delivery not found');
      // Order first, then delivery: staff order transitions lock in this order.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${initial.order_id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM deliveries WHERE id = ${id}::uuid FOR UPDATE`;
      const delivery = await tx.delivery.findUnique({
        where: { id },
        include: {
          order: {
            include: {
              external_driver_trip_order: {
                include: { trip: { select: { fare_bearer: true } } },
              },
            },
          },
          party: { select: { user_id: true } },
        },
      });
      if (!delivery) throw new NotFoundException('Delivery not found');
      if (assignedAgentOnly && delivery.party?.user_id !== actorId) {
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
        throw staleOrder(
          delivery.order.status,
          delivery.order.version,
          undefined,
          'order_version',
        );
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

      const now =
        recordedAt ??
        (input.status === 'delivered' && 'event_at' in input && input.event_at
          ? new Date(input.event_at)
          : new Date());
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
          throw staleOrder(
            current.status,
            current.version,
            undefined,
            'order_version',
          );
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
          now,
        );
      }
      if (input.status === 'delivered') {
        if (!delivery.agent_id) {
          throw new ConflictException('Delivery has no assigned party');
        }
        if (delivery.order.currency_code !== 'IQD') {
          throw new ConflictException(
            'COD delivery posting currently requires IQD',
          );
        }
        const customerDue = new PrismaRuntime.Decimal(delivery.order.total);
        const configuredDeliveryFee = new PrismaRuntime.Decimal(
          delivery.order.delivery_fee,
        );
        const tripOrder = delivery.order.external_driver_trip_order;
        const customerPaidTrip =
          tripOrder?.trip.fare_bearer === 'customer_direct';
        const passThroughFare = customerPaidTrip
          ? configuredDeliveryFee
          : new PrismaRuntime.Decimal(0);
        if (
          customerPaidTrip &&
          !configuredDeliveryFee.isZero() &&
          !new PrismaRuntime.Decimal(tripOrder.fare_share_iqd).equals(
            configuredDeliveryFee,
          )
        ) {
          throw new ConflictException({
            status: 409,
            code: 'TRIP_FARE_SHARE_MISMATCH',
            message:
              'A fee-carrying customer-paid trip order must use its delivery fee as the fare share',
            errors: [],
          });
        }
        const due = customerDue.minus(passThroughFare);
        const deliveryFee = customerPaidTrip
          ? new PrismaRuntime.Decimal(0)
          : configuredDeliveryFee;
        const goodsRevenue = due.minus(deliveryFee);
        if (due.lt(0) || goodsRevenue.lt(0)) {
          throw new ConflictException('Order delivery amount is invalid');
        }
        const confirmation = input.collection_confirmation!;
        if (
          confirmation === 'unconfirmed' &&
          input.collected_amount !== undefined
        ) {
          throw new UnprocessableEntityException(
            'collected_amount must be omitted while collection is unconfirmed',
          );
        }
        const customerCollected =
          confirmation === 'confirmed'
            ? new PrismaRuntime.Decimal(input.collected_amount!)
            : new PrismaRuntime.Decimal(0);
        if (
          confirmation === 'confirmed' &&
          (customerCollected.lt(passThroughFare) ||
            customerCollected.gt(customerDue))
        ) {
          throw new UnprocessableEntityException(
            `collected_amount must be between ${passThroughFare.toString()} and the customer order total`,
          );
        }
        const collected =
          confirmation === 'confirmed'
            ? customerCollected.minus(passThroughFare)
            : new PrismaRuntime.Decimal(0);
        const shortfall = due.minus(collected);
        const scenario: DeliveryPostingScenario =
          confirmation === 'unconfirmed'
            ? 'delivered_unconfirmed'
            : shortfall.isZero()
              ? 'delivered_full'
              : 'delivered_short';
        const cost = await this.inventory.settleCustodyToSold(
          tx,
          delivery.order_id,
          actorId,
        );
        const amounts = this.deliveryPostingAmounts(
          cost,
          goodsRevenue,
          deliveryFee,
          due,
          collected,
          shortfall,
        );
        const collectionId = randomUUID();
        const postingDate = businessDate(now);
        const entry = await this.ledger.post(tx, {
          sourceType: 'delivery_collection',
          sourceId: collectionId,
          event: scenario,
          documentDate: postingDate,
          accountingDate: postingDate,
          createdBy: actorId,
          description: 'Revenue and COD collection recognized on delivery',
          lines: this.deliveryPostingLines(scenario, amounts),
        });
        const collectionStatus =
          scenario === 'delivered_unconfirmed'
            ? 'unconfirmed'
            : scenario === 'delivered_full'
              ? 'confirmed_full'
              : 'confirmed_short';
        await tx.deliveryCollection.create({
          data: {
            id: collectionId,
            delivery_id: id,
            order_id: delivery.order_id,
            party_id: delivery.agent_id,
            status: collectionStatus,
            due_amount: due,
            collected_amount: confirmation === 'confirmed' ? collected : null,
            shortfall_amount: confirmation === 'confirmed' ? shortfall : null,
            currency_code: delivery.order.currency_code,
            delivered_operation_id: input.operation_id!,
            delivered_by: actorId,
            delivered_at: now,
            accounting_date: postingDate,
            delivery_journal_entry_id: entry.id,
            ...(confirmation === 'confirmed'
              ? { confirmed_by: actorId, confirmed_at: now }
              : {}),
          },
        });
        if (scenario === 'delivered_full') {
          await this.reconcileCodPayments(tx, delivery.order_id, actorId, now);
        }
        await this.audit.record(tx, {
          actorId,
          action: 'delivery.collection_record',
          entityType: 'delivery_collection',
          entityId: collectionId,
          after: {
            status: collectionStatus,
            due_amount: due.toString(),
            collected_amount:
              confirmation === 'confirmed' ? collected.toString() : null,
            shortfall_amount:
              confirmation === 'confirmed' ? shortfall.toString() : null,
            party_id: delivery.agent_id,
            source:
              'source' in input && input.source ? input.source : 'agent_app',
            customer_paid_fare_iqd: passThroughFare.toString(),
          },
        });
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
      const attemptNumber =
        delivery.retry_count + (delivery.status === 'failed' ? 2 : 1);
      if (input.status === 'out_for_delivery') {
        await tx.deliveryAttempt.upsert({
          where: {
            delivery_id_attempt_number: {
              delivery_id: id,
              attempt_number: attemptNumber,
            },
          },
          create: {
            delivery_id: id,
            attempt_number: attemptNumber,
            party_id: delivery.agent_id!,
            status: 'out_for_delivery',
            started_at: now,
          },
          update: {
            party_id: delivery.agent_id!,
            status: 'out_for_delivery',
            reason: null,
            started_at: now,
            completed_at: null,
          },
        });
      } else if (input.status === 'failed' || input.status === 'delivered') {
        await tx.deliveryAttempt.upsert({
          where: {
            delivery_id_attempt_number: {
              delivery_id: id,
              attempt_number: delivery.retry_count + 1,
            },
          },
          create: {
            delivery_id: id,
            attempt_number: delivery.retry_count + 1,
            party_id: delivery.agent_id!,
            status: input.status,
            reason: input.status === 'failed' ? input.reason : null,
            started_at: delivery.dispatched_at ?? now,
            completed_at: now,
          },
          update: {
            status: input.status,
            reason: input.status === 'failed' ? input.reason : null,
            completed_at: now,
          },
        });
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
        include: {
          order: { select: { version: true, total: true } },
          party: {
            select: {
              id: true,
              kind: true,
              user_id: true,
              name: true,
              phone: true,
            },
          },
          attempts: {
            include: { party: { select: { id: true, name: true } } },
            orderBy: { attempt_number: 'asc' },
          },
          collection: true,
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
      if (
        this.tripHistory &&
        tripEvent.record !== false &&
        (input.status === 'delivered' || input.status === 'failed')
      ) {
        const suppliedOperationId =
          'operation_id' in input && input.operation_id
            ? input.operation_id
            : null;
        await this.tripHistory.recordForOrder(tx, {
          actorId,
          operationId:
            suppliedOperationId ??
            `delivery-${id}-${input.order_version}-${input.status}`,
          orderId: delivery.order_id,
          expectedTripId: tripEvent.expectedTripId,
          type: input.status,
          source:
            'source' in input && input.source
              ? input.source
              : assignedAgentOnly
                ? 'agent_app'
                : 'admin_delivery',
          note: input.status === 'failed' ? input.reason : undefined,
          eventAt: now,
        });
      }
      return updated;
    };
    const row = transaction
      ? await work(transaction)
      : await this.prisma.$transaction(work);
    return this.present(row);
  }

  async listUnconfirmed(query: UnconfirmedDeliveriesQueryDto) {
    return this.listCollections(
      {
        ...query,
        status: 'unconfirmed',
      },
      query.party_id,
    );
  }

  async listPartyCollections(partyId: string, query: PartyCollectionsQueryDto) {
    const party = await this.prisma.deliveryParty.findUnique({
      where: { id: partyId },
      select: { id: true },
    });
    if (!party) throw new NotFoundException('Delivery party not found');
    return this.listCollections(query, partyId);
  }

  private async listCollections(
    query:
      | PartyCollectionsQueryDto
      | (UnconfirmedDeliveriesQueryDto & {
          status: 'unconfirmed';
        }),
    partyId?: string,
  ) {
    if (query.date_from && query.date_to && query.date_from > query.date_to) {
      throw new UnprocessableEntityException(
        'date_from must be on or before date_to',
      );
    }
    if (
      query.amount_min !== undefined &&
      query.amount_max !== undefined &&
      query.amount_min > query.amount_max
    ) {
      throw new UnprocessableEntityException(
        'amount_min must be less than or equal to amount_max',
      );
    }
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const where: Prisma.DeliveryCollectionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(partyId ? { party_id: partyId } : {}),
      ...('order_id' in query && query.order_id
        ? { order_id: query.order_id }
        : {}),
      ...(query.date_from || query.date_to
        ? {
            delivered_at: {
              ...(query.date_from
                ? { gte: businessDayStart(query.date_from) }
                : {}),
              ...(query.date_to ? { lte: businessDayEnd(query.date_to) } : {}),
            },
          }
        : {}),
      ...(query.amount_min !== undefined || query.amount_max !== undefined
        ? {
            due_amount: {
              ...(query.amount_min !== undefined
                ? { gte: query.amount_min }
                : {}),
              ...(query.amount_max !== undefined
                ? { lte: query.amount_max }
                : {}),
            },
          }
        : {}),
    };
    const direction = query.sort_direction ?? 'desc';
    const orderBy: Prisma.DeliveryCollectionOrderByWithRelationInput[] =
      query.sort_by === 'amount'
        ? [{ due_amount: direction }, { delivered_at: 'desc' }, { id: 'desc' }]
        : [{ delivered_at: direction }, { id: direction }];
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.deliveryCollection.count({ where }),
      this.prisma.deliveryCollection.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              order_number: true,
              user_id: true,
              total: true,
              delivery_fee: true,
            },
          },
          party: {
            select: {
              id: true,
              kind: true,
              user_id: true,
              name: true,
              phone: true,
            },
          },
          cash_receipt_allocations: {
            where: { batch: { voucher: { reversal: { is: null } } } },
            include: {
              batch: {
                include: {
                  voucher: {
                    select: {
                      id: true,
                      document_number: true,
                      document_date: true,
                    },
                  },
                },
              },
            },
            orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
          },
          trip_settlement_allocations: {
            include: {
              trip: { select: { id: true, document_number: true } },
            },
            orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
          },
          custody_exceptions: {
            where: { reversal: { is: null } },
            select: {
              id: true,
              document_number: true,
              type: true,
              amount_iqd: true,
              exception_offset_iqd: true,
              settlement_method: true,
              document_date: true,
            },
            orderBy: [{ document_date: 'asc' }, { id: 'asc' }],
          },
        },
        orderBy,
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return {
      page,
      per_page: perPage,
      total,
      data: rows.map((row) => this.presentCollection(row)),
    };
  }

  confirmCollection(
    actorId: string,
    deliveryId: string,
    input: ConfirmDeliveryCollectionDto,
  ) {
    return this.operations.execute({
      userId: actorId,
      operationId: input.operation_id,
      endpoint: `POST /admin/deliveries/${deliveryId}/collection-confirmation`,
      payload: input,
      work: async (tx) => {
        await tx.$queryRaw`SELECT id FROM delivery_collections WHERE delivery_id = ${deliveryId}::uuid FOR UPDATE`;
        const collection = await tx.deliveryCollection.findUnique({
          where: { delivery_id: deliveryId },
          include: {
            order: {
              select: {
                id: true,
                order_number: true,
                user_id: true,
                total: true,
                delivery_fee: true,
              },
            },
            party: {
              select: {
                id: true,
                kind: true,
                user_id: true,
                name: true,
                phone: true,
              },
            },
          },
        });
        if (!collection) {
          throw new NotFoundException('Delivery collection not found');
        }
        if (collection.status !== 'unconfirmed') {
          throw new ConflictException(
            'Delivery collection is already confirmed',
          );
        }
        const due = new PrismaRuntime.Decimal(collection.due_amount);
        const collected = new PrismaRuntime.Decimal(input.collected_amount);
        if (collected.lt(0) || collected.gt(due)) {
          throw new UnprocessableEntityException(
            'collected_amount must be between zero and the order amount due',
          );
        }
        const shortfall = due.minus(collected);
        const scenario: DeliveryPostingScenario = shortfall.isZero()
          ? 'later_full_confirmation'
          : 'later_short_confirmation';
        const now = new Date();
        const postingDate = businessDate(now);
        const amounts = this.deliveryPostingAmounts(
          new PrismaRuntime.Decimal(0),
          new PrismaRuntime.Decimal(0),
          new PrismaRuntime.Decimal(0),
          due,
          collected,
          shortfall,
        );
        const entry = await this.ledger.post(tx, {
          sourceType: 'delivery_collection',
          sourceId: collection.id,
          event: scenario,
          documentDate: postingDate,
          accountingDate: postingDate,
          createdBy: actorId,
          description: 'COD collection confirmed after delivery',
          lines: this.deliveryPostingLines(scenario, amounts),
        });
        const status = shortfall.isZero()
          ? 'confirmed_full'
          : 'confirmed_short';
        const updated = await tx.deliveryCollection.update({
          where: { id: collection.id },
          data: {
            status,
            collected_amount: collected,
            shortfall_amount: shortfall,
            confirmed_operation_id: input.operation_id,
            confirmed_by: actorId,
            confirmed_at: now,
            confirmation_journal_entry_id: entry.id,
          },
          include: {
            order: {
              select: {
                id: true,
                order_number: true,
                user_id: true,
                total: true,
                delivery_fee: true,
              },
            },
            party: {
              select: {
                id: true,
                kind: true,
                user_id: true,
                name: true,
                phone: true,
              },
            },
          },
        });
        if (status === 'confirmed_full') {
          await this.reconcileCodPayments(
            tx,
            collection.order_id,
            actorId,
            now,
          );
        }
        await this.audit.record(tx, {
          actorId,
          action: 'delivery.collection_confirm',
          entityType: 'delivery_collection',
          entityId: collection.id,
          before: { status: collection.status },
          after: {
            status,
            collected_amount: collected.toString(),
            shortfall_amount: shortfall.toString(),
          },
        });
        return this.presentCollection(updated);
      },
    });
  }

  private deliveryPostingAmounts(
    cost: PrismaRuntime.Decimal,
    goodsRevenue: PrismaRuntime.Decimal,
    deliveryFee: PrismaRuntime.Decimal,
    due: PrismaRuntime.Decimal,
    collected: PrismaRuntime.Decimal,
    shortfall: PrismaRuntime.Decimal,
  ): DeliveryPostingAmounts {
    return {
      cost: cost.toString(),
      goodsRevenue: goodsRevenue.toString(),
      deliveryFee: deliveryFee.toString(),
      due: due.toString(),
      collected: collected.toString(),
      shortfall: shortfall.toString(),
    };
  }

  private deliveryPostingLines(
    scenario: DeliveryPostingScenario,
    amounts: DeliveryPostingAmounts,
  ): PostingLine[] {
    return materializeDeliveryPosting(scenario, amounts).map((item) => ({
      accountCode: item.accountCode,
      side: item.side,
      baseAmount: item.amount,
      currencyCode: 'IQD',
      originalAmount: item.amount,
      exchangeRate: '1',
    }));
  }

  private async reconcileCodPayments(
    tx: Prisma.TransactionClient,
    orderId: string,
    actorId: string,
    at: Date,
  ) {
    const payments = await tx.payment.findMany({
      where: { order_id: orderId, method: 'cod', status: 'pending' },
    });
    for (const payment of payments) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'paid', paid_at: at },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'payment.reconcile_cod',
        entityType: 'payment',
        entityId: payment.id,
        before: { status: payment.status, paid_at: payment.paid_at },
        after: { status: 'paid', paid_at: at.toISOString() },
      });
    }
  }

  private presentCollection(row: {
    id: string;
    delivery_id: string;
    order_id: string;
    party_id: string;
    status: string;
    due_amount: PrismaRuntime.Decimal;
    collected_amount: PrismaRuntime.Decimal | null;
    shortfall_amount: PrismaRuntime.Decimal | null;
    currency_code: string;
    delivered_at: Date;
    accounting_date: Date;
    confirmed_at: Date | null;
    delivery_journal_entry_id: string;
    confirmation_journal_entry_id: string | null;
    order?: unknown;
    party?: unknown;
    cash_receipt_allocations?: Array<{
      id: string;
      amount_iqd: PrismaRuntime.Decimal;
      created_at: Date;
      batch: {
        id: string;
        document_number: string;
        voucher: {
          id: string;
          document_number: string;
          document_date: Date;
        };
      };
    }>;
    trip_settlement_allocations?: Array<{
      id: string;
      amount_iqd: PrismaRuntime.Decimal;
      created_at: Date;
      trip: { id: string; document_number: string };
    }>;
    custody_exceptions?: Array<{
      id: string;
      document_number: string;
      type: string;
      amount_iqd: PrismaRuntime.Decimal;
      exception_offset_iqd: PrismaRuntime.Decimal;
      settlement_method: string | null;
      document_date: Date;
    }>;
  }) {
    const allocations = row.cash_receipt_allocations;
    const allocated = allocations?.reduce(
      (sum, allocation) => sum.plus(allocation.amount_iqd),
      new PrismaRuntime.Decimal(0),
    );
    const tripNettings = row.trip_settlement_allocations;
    const netted = tripNettings?.reduce(
      (sum, allocation) => sum.plus(allocation.amount_iqd),
      new PrismaRuntime.Decimal(0),
    );
    const settledAmount =
      allocated === undefined || netted === undefined
        ? allocated
        : allocated.plus(netted);
    const collected = row.collected_amount;
    const unsettled =
      settledAmount === undefined || collected === null
        ? null
        : PrismaRuntime.Decimal.max(0, collected.minus(settledAmount));
    const settlementStatus =
      collected === null
        ? 'unconfirmed'
        : settledAmount?.gte(collected)
          ? 'settled'
          : settledAmount?.gt(0)
            ? 'partially_settled'
            : 'unsettled';
    const exceptions = row.custody_exceptions;
    const exceptionOffset = exceptions?.reduce(
      (sum, exception) => sum.plus(exception.exception_offset_iqd),
      new PrismaRuntime.Decimal(0),
    );
    const openException =
      row.shortfall_amount === null || exceptionOffset === undefined
        ? null
        : PrismaRuntime.Decimal.max(
            0,
            row.shortfall_amount.minus(exceptionOffset),
          );
    return {
      id: row.id,
      delivery_id: row.delivery_id,
      order_id: row.order_id,
      party_id: row.party_id,
      status: row.status,
      due_amount: Number(row.due_amount),
      collected_amount:
        row.collected_amount === null ? null : Number(row.collected_amount),
      shortfall_amount:
        row.shortfall_amount === null ? null : Number(row.shortfall_amount),
      currency: row.currency_code,
      delivered_at: row.delivered_at,
      accounting_date: businessDateText(row.accounting_date),
      confirmed_at: row.confirmed_at,
      delivery_journal_entry_id: row.delivery_journal_entry_id,
      confirmation_journal_entry_id: row.confirmation_journal_entry_id,
      ...(row.order === undefined ? {} : { order: row.order }),
      ...(row.party === undefined ? {} : { party: row.party }),
      ...(allocations === undefined
        ? {}
        : {
            settlement_status: settlementStatus,
            allocated_amount_iqd: Number(settledAmount ?? 0),
            receipt_allocated_amount_iqd: Number(allocated ?? 0),
            fare_netted_amount_iqd: Number(netted ?? 0),
            unsettled_amount_iqd: unsettled === null ? null : Number(unsettled),
            receipt_allocations: allocations.map((allocation) => ({
              id: allocation.id,
              batch_id: allocation.batch.id,
              batch_document_number: allocation.batch.document_number,
              voucher_id: allocation.batch.voucher.id,
              voucher_document_number: allocation.batch.voucher.document_number,
              voucher_document_date: businessDateText(
                allocation.batch.voucher.document_date,
              ),
              amount_iqd: Number(allocation.amount_iqd),
              created_at: allocation.created_at,
            })),
            fare_nettings: tripNettings?.map((allocation) => ({
              id: allocation.id,
              trip_id: allocation.trip.id,
              trip_document_number: allocation.trip.document_number,
              amount_iqd: Number(allocation.amount_iqd),
              created_at: allocation.created_at,
            })),
          }),
      ...(exceptions === undefined
        ? {}
        : {
            exception_offset_iqd: Number(exceptionOffset ?? 0),
            uncollected_amount_iqd:
              openException === null ? null : Number(openException),
            exceptions: exceptions.map((exception) => ({
              id: exception.id,
              document_number: exception.document_number,
              type: exception.type,
              amount_iqd: Number(exception.amount_iqd),
              exception_offset_iqd: Number(exception.exception_offset_iqd),
              settlement_method: exception.settlement_method,
              document_date: businessDateText(exception.document_date),
            })),
          }),
    };
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
          include: { order: true, party: { select: { user_id: true } } },
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
            agent_id: delivery.party?.user_id ?? null,
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

  private present(
    row: Delivery & {
      order: { version: number; total: PrismaRuntime.Decimal };
      party?: {
        id: string;
        kind: string;
        user_id: string | null;
        name: string;
        phone: string;
      } | null;
      attempts: Array<{
        id: string;
        delivery_id: string;
        attempt_number: number;
        status: string;
        reason: string | null;
        started_at: Date;
        completed_at: Date | null;
        party: { id: string; name: string | null };
      }>;
      collection?: {
        id: string;
        delivery_id: string;
        order_id: string;
        party_id: string;
        status: string;
        due_amount: PrismaRuntime.Decimal;
        collected_amount: PrismaRuntime.Decimal | null;
        shortfall_amount: PrismaRuntime.Decimal | null;
        currency_code: string;
        delivered_at: Date;
        accounting_date: Date;
        confirmed_at: Date | null;
        delivery_journal_entry_id: string;
        confirmation_journal_entry_id: string | null;
      } | null;
    },
  ) {
    return {
      id: row.id,
      order_id: row.order_id,
      order_version: row.order.version,
      amount_due: Number(row.order.total),
      agent_id:
        row.party === undefined ? row.agent_id : (row.party?.user_id ?? null),
      party_id: row.agent_id,
      party: row.party,
      status: row.status,
      delivery_fee: Number(row.delivery_fee),
      currency: row.currency_code,
      dispatched_at: row.dispatched_at,
      delivered_at: row.delivered_at,
      failure_reason: row.failure_reason,
      failed_at: row.failed_at,
      retry_count: row.retry_count,
      attempts: row.attempts,
      collection: row.collection
        ? this.presentCollection(row.collection)
        : null,
    };
  }
}
