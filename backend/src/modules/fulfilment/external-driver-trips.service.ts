import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { assertDifferentActor } from '../../common/access/separation-of-duties';
import { PrismaService } from '../../database/prisma.service';
import { conflict, invalid } from '../../common/http/api-error';
import { actorDisplayName, actorSelect } from '../../common/users/actor-name';
import { AuditService } from '../audit/audit.service';
import { businessDateText, parseBusinessDate } from '../finance/business-date';
import { DateRulesService } from '../finance/date-rules.service';
import { DocumentNumberService } from '../finance/document-number.service';
import { LedgerService, type PostingLine } from '../finance/ledger.service';
import { OperationService } from '../finance/operation.service';
import { DeliveriesService } from './deliveries.service';
import { CustodyExceptionsService } from './custody-exceptions.service';
import { ExternalDriverTripHistoryService } from './external-driver-trip-history.service';
import {
  AddExternalDriverTripOrderDto,
  CloseExternalDriverTripDto,
  CreateExternalDriverTripDto,
  ExternalDriverTripQueryDto,
  ExternalDriverTripDeliveredDto,
  ExternalDriverTripDoorReturnDto,
  ExternalDriverTripFailedDto,
  ExternalDriverTripLossDto,
  StartExternalDriverTripDto,
} from './dto/external-driver-trip.dto';

type Tx = Prisma.TransactionClient;
type Actor = Pick<AuthenticatedRequestUser, 'id' | 'permissions'>;

const tripInclude = {
  creator: { select: actorSelect },
  starter: { select: actorSelect },
  closer: { select: actorSelect },
  driver_party: {
    select: {
      id: true,
      kind: true,
      name: true,
      phone: true,
      vehicle_number: true,
      is_active: true,
    },
  },
  fare_cash_account: {
    select: {
      id: true,
      name: true,
      kind: true,
      currency_code: true,
      is_active: true,
    },
  },
  orders: {
    include: {
      order: {
        select: {
          id: true,
          order_number: true,
          status: true,
          version: true,
          total: true,
          delivery_fee: true,
          currency_code: true,
          delivery_city: true,
          delivery_area: true,
          delivery_street: true,
          delivery_details: true,
          items: {
            select: {
              id: true,
              product_name_ar: true,
              product_name_en: true,
              quantity: true,
            },
          },
          delivery_collection: {
            include: {
              cash_receipt_allocations: {
                where: { batch: { voucher: { reversal: { is: null } } } },
                select: { amount_iqd: true },
              },
              trip_settlement_allocations: {
                select: { amount_iqd: true },
              },
            },
          },
          custody_exceptions: {
            where: { reversal: { is: null } },
            select: {
              id: true,
              document_number: true,
              type: true,
              amount_iqd: true,
              liability_bearer: true,
            },
          },
          delivery: {
            select: {
              id: true,
              status: true,
              dispatched_at: true,
              delivered_at: true,
              failure_reason: true,
              attempts: {
                select: {
                  attempt_number: true,
                  status: true,
                  reason: true,
                  started_at: true,
                  completed_at: true,
                },
                orderBy: { attempt_number: 'asc' as const },
              },
            },
          },
        },
      },
    },
    orderBy: [{ handed_over_at: 'asc' as const }, { id: 'asc' as const }],
  },
  events: {
    include: { recorder: { select: actorSelect } },
    orderBy: [{ event_at: 'asc' as const }, { id: 'asc' as const }],
  },
  settlement_allocations: {
    include: {
      collection: {
        select: {
          id: true,
          order_id: true,
          order: { select: { order_number: true } },
        },
      },
    },
    orderBy: [{ created_at: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.ExternalDriverTripInclude;

@Injectable()
export class ExternalDriverTripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: OperationService,
    private readonly dates: DateRulesService,
    private readonly numbers: DocumentNumberService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly deliveries: DeliveriesService,
    private readonly exceptions: CustodyExceptionsService,
    private readonly history: ExternalDriverTripHistoryService,
  ) {}

  async create(actor: Actor, input: CreateExternalDriverTripDto) {
    const fare = this.nonNegative(input.fare_amount_iqd, 'fare_amount_iqd');
    this.assertFareMethod(input);
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions: actor.permissions,
    });
    return this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint: 'POST /admin/external-driver-trips',
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        const party = await tx.deliveryParty.findUnique({
          where: { id: input.driver_party_id },
        });
        if (!party || party.kind !== 'external_driver' || !party.is_active) {
          throw new NotFoundException('Active external driver not found');
        }
        if (input.fare_cash_account_id) {
          await this.cashAccount(tx, input.fare_cash_account_id);
        }
        const id = randomUUID();
        const documentNumber = await this.numbers.issue(
          tx,
          'external_driver_trip',
          'TRP',
          dates.documentDate,
        );
        await tx.externalDriverTrip.create({
          data: {
            id,
            document_number: documentNumber,
            create_operation_id: input.operation_id,
            driver_party_id: party.id,
            fare_bearer: input.fare_bearer,
            fare_amount_iqd: fare,
            fare_settlement_method: input.fare_settlement_method,
            fare_cash_account_id: input.fare_cash_account_id,
            failure_cancellation_agreement:
              input.failure_cancellation_agreement?.trim() || null,
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            backdate_reason: dates.backdateReason ?? null,
            created_by: actor.id,
          },
        });
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'external_driver_trip.create',
          entityType: 'external_driver_trip',
          entityId: id,
          after: {
            document_number: documentNumber,
            driver_party_id: party.id,
            fare_bearer: input.fare_bearer,
            fare_amount_iqd: fare.toString(),
            fare_settlement_method: input.fare_settlement_method,
          },
        });
        return this.detailTx(tx, id);
      },
    });
  }

  addOrder(actor: Actor, tripId: string, input: AddExternalDriverTripOrderDto) {
    const share = this.nonNegative(input.fare_share_iqd, 'fare_share_iqd');
    const eventAt = new Date(input.event_at);
    return this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint: `POST /admin/external-driver-trips/${tripId}/orders`,
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        await tx.$queryRaw`SELECT id FROM external_driver_trips WHERE id=${tripId}::uuid FOR UPDATE`;
        const trip = await tx.externalDriverTrip.findUnique({
          where: { id: tripId },
        });
        if (!trip)
          throw new NotFoundException('External driver trip not found');
        if (trip.status !== 'open') {
          throw conflict(
            'TRIP_NOT_OPEN_FOR_ORDER',
            'Orders can be added only to an open trip',
          );
        }
        const order = await tx.order.findUnique({
          where: { id: input.order_id },
          include: { delivery: true },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (!order.delivery || order.delivery.status !== 'assigned') {
          throw conflict(
            'TRIP_ORDER_NOT_ASSIGNED',
            'Trip handover requires the current assigned delivery',
          );
        }
        if (trip.fare_bearer === 'customer_direct') {
          if (
            !order.delivery_fee.isZero() &&
            !share.equals(order.delivery_fee)
          ) {
            throw conflict(
              'TRIP_FARE_SHARE_MISMATCH',
              'A fee-carrying customer-paid trip order must use its delivery fee as the fare share',
            );
          }
          if (!input.customer_acceptance_note?.trim()) {
            throw invalid(
              'CUSTOMER_ACCEPTANCE_NOTE_REQUIRED',
              'customer_acceptance_note is required for a customer-direct fare',
            );
          }
        }
        await tx.delivery.update({
          where: { id: order.delivery.id },
          data: { agent_id: trip.driver_party_id },
        });
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'delivery.assign',
          entityType: 'delivery',
          entityId: order.delivery.id,
          before: { agent_id: order.delivery.agent_id },
          after: { party_id: trip.driver_party_id, trip_id: trip.id },
        });
        await this.deliveries.transitionStatus(
          actor.id,
          order.delivery.id,
          { status: 'out_for_delivery', order_version: input.order_version },
          false,
          false,
          tx,
          eventAt,
        );
        await tx.externalDriverTripOrder.create({
          data: {
            trip_id: trip.id,
            order_id: order.id,
            fare_share_iqd: share,
            customer_acceptance_note:
              input.customer_acceptance_note?.trim() || null,
            handed_over_by: actor.id,
            handed_over_at: eventAt,
          },
        });
        await this.history.record(tx, {
          actorId: actor.id,
          operationId: input.operation_id,
          tripId: trip.id,
          orderId: order.id,
          type: 'handover',
          source: input.source,
          note: input.customer_acceptance_note,
          eventAt,
        });
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'external_driver_trip.handover',
          entityType: 'external_driver_trip',
          entityId: trip.id,
          after: {
            order_id: order.id,
            fare_share_iqd: share.toString(),
            source: input.source,
            event_at: eventAt,
          },
        });
        return this.detailTx(tx, trip.id);
      },
    });
  }

  start(actor: Actor, tripId: string, input: StartExternalDriverTripDto) {
    const eventAt = new Date(input.event_at);
    return this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint: `POST /admin/external-driver-trips/${tripId}/start`,
      payload: input,
      responseStatus: 200,
      work: async (tx) => {
        await tx.$queryRaw`SELECT id FROM external_driver_trips WHERE id=${tripId}::uuid FOR UPDATE`;
        const trip = await tx.externalDriverTrip.findUnique({
          where: { id: tripId },
          include: { orders: true },
        });
        if (!trip)
          throw new NotFoundException('External driver trip not found');
        if (trip.status !== 'open') {
          throw conflict(
            'TRIP_NOT_OPEN_FOR_START',
            'Only an open trip can be started',
          );
        }
        if (!trip.orders.length) {
          throw conflict(
            'TRIP_HAS_NO_ORDERS',
            'A trip requires at least one order',
          );
        }
        const shares = trip.orders.reduce(
          (sum, row) => sum.plus(row.fare_share_iqd),
          new Prisma.Decimal(0),
        );
        if (!shares.equals(trip.fare_amount_iqd)) {
          throw conflict(
            'TRIP_FARE_SHARES_MISMATCH',
            'Trip order fare shares must equal the one trip fare',
          );
        }
        await tx.externalDriverTrip.update({
          where: { id: trip.id },
          data: {
            status: 'in_progress',
            started_by: actor.id,
            started_at: eventAt,
          },
        });
        await this.history.record(tx, {
          actorId: actor.id,
          operationId: input.operation_id,
          tripId: trip.id,
          type: 'started',
          source: input.source,
          eventAt,
        });
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'external_driver_trip.start',
          entityType: 'external_driver_trip',
          entityId: trip.id,
          before: { status: 'open' },
          after: { status: 'in_progress', source: input.source },
        });
        return this.detailTx(tx, trip.id);
      },
    });
  }

  recordDelivered(
    actor: Actor,
    tripId: string,
    orderId: string,
    input: ExternalDriverTripDeliveredDto,
  ) {
    const eventAt = new Date(input.event_at);
    return this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint: `POST /admin/external-driver-trips/${tripId}/orders/${orderId}/delivered`,
      payload: input,
      responseStatus: 200,
      work: async (tx) => {
        const delivery = await this.tripOrderDeliveryTx(tx, tripId, orderId);
        return this.deliveries.transitionStatus(
          actor.id,
          delivery.id,
          {
            status: 'delivered',
            order_version: input.order_version,
            operation_id: input.operation_id,
            collection_confirmation: input.collection_confirmation,
            collected_amount: input.collected_amount,
            source: input.source,
            event_at: input.event_at,
          },
          false,
          false,
          tx,
          eventAt,
          { expectedTripId: tripId },
        );
      },
    });
  }

  recordFailed(
    actor: Actor,
    tripId: string,
    orderId: string,
    input: ExternalDriverTripFailedDto,
  ) {
    const eventAt = new Date(input.event_at);
    return this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint: `POST /admin/external-driver-trips/${tripId}/orders/${orderId}/failed`,
      payload: input,
      responseStatus: 200,
      work: async (tx) => {
        const delivery = await this.tripOrderDeliveryTx(tx, tripId, orderId);
        return this.deliveries.transitionStatus(
          actor.id,
          delivery.id,
          {
            status: 'failed',
            order_version: input.order_version,
            reason: input.reason,
            operation_id: input.operation_id,
            source: input.source,
            event_at: input.event_at,
          },
          false,
          false,
          tx,
          eventAt,
          { expectedTripId: tripId },
        );
      },
    });
  }

  async recordDoorReturn(
    actor: Actor,
    tripId: string,
    orderId: string,
    input: ExternalDriverTripDoorReturnDto,
  ) {
    const delivery = await this.tripOrderDelivery(tripId, orderId);
    return this.exceptions.recordDoorReturn(actor, delivery.id, input, {
      endpoint: `POST /admin/external-driver-trips/${tripId}/orders/${orderId}/return-at-door`,
      expectedTripId: tripId,
      requireTripInProgress: true,
    });
  }

  recordLoss(
    actor: Actor,
    tripId: string,
    orderId: string,
    input: ExternalDriverTripLossDto,
  ) {
    return this.exceptions.recordGoodsLoss(
      actor,
      {
        operation_id: input.operation_id,
        order_id: orderId,
        liability_bearer: input.liability_bearer,
        reason: input.reason,
        lines: input.lines,
        document_date: input.document_date,
        accounting_date: input.accounting_date,
        backdate_reason: input.backdate_reason,
      },
      {
        endpoint: `POST /admin/external-driver-trips/${tripId}/orders/${orderId}/lost`,
        expectedTripId: tripId,
        requireTripInProgress: true,
        source: input.source,
        eventAt: new Date(input.event_at),
      },
    );
  }

  async close(actor: Actor, tripId: string, input: CloseExternalDriverTripDto) {
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions: actor.permissions,
    });
    const eventAt = new Date(input.event_at);
    return this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint: `POST /admin/external-driver-trips/${tripId}/close`,
      payload: input,
      responseStatus: 200,
      work: async (tx) => {
        await tx.$queryRaw`SELECT id FROM external_driver_trips WHERE id=${tripId}::uuid FOR UPDATE`;
        const trip = await tx.externalDriverTrip.findUnique({
          where: { id: tripId },
          include: {
            orders: {
              include: {
                order: {
                  include: {
                    delivery_collection: {
                      include: {
                        cash_receipt_allocations: {
                          where: {
                            batch: { voucher: { reversal: { is: null } } },
                          },
                        },
                        trip_settlement_allocations: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });
        if (!trip)
          throw new NotFoundException('External driver trip not found');
        if (trip.status !== 'in_progress') {
          throw conflict(
            'TRIP_NOT_IN_PROGRESS',
            'Only an in-progress trip can be closed',
          );
        }
        assertDifferentActor(
          actor.id,
          trip.created_by,
          'A user cannot approve and close their own trip',
          'SELF_TRIP_CLOSE_FORBIDDEN',
        );
        const unresolved = trip.orders.filter(
          (row) =>
            ![
              'ready_for_dispatch',
              'delivered',
              'returned',
              'cancelled',
            ].includes(row.order.status) ||
            row.order.delivery_collection?.status === 'unconfirmed',
        );
        if (unresolved.length) {
          throw new ConflictException({
            status: 409,
            code: 'TRIP_ORDERS_UNRESOLVED',
            message:
              'Every trip order must be delivered with a confirmed collection, returned, or fully resolved before close',
            errors: unresolved.map((row) => ({
              field: `orders.${row.order_id}`,
              code: 'unresolved',
              message: 'Order is not ready for trip close',
            })),
          });
        }
        const collections = trip.orders.flatMap((row) =>
          row.order.delivery_collection ? [row.order.delivery_collection] : [],
        );
        const expected = collections.reduce(
          (sum, collection) =>
            sum.plus(collection.collected_amount ?? new Prisma.Decimal(0)),
          new Prisma.Decimal(0),
        );
        const received = collections.reduce(
          (sum, collection) =>
            collection.cash_receipt_allocations.reduce(
              (inner, allocation) => inner.plus(allocation.amount_iqd),
              sum,
            ),
          new Prisma.Decimal(0),
        );
        let netted = new Prisma.Decimal(0);
        let fareAccrualId: string | undefined;
        let farePaymentId: string | undefined;
        let fareNettingId: string | undefined;
        if (trip.fare_bearer === 'store' && trip.fare_amount_iqd.gt(0)) {
          const accrual = await this.ledger.post(tx, {
            sourceType: 'external_driver_trip',
            sourceId: trip.id,
            event: 'fare_accrual',
            documentDate: dates.documentDate,
            accountingDate: dates.accountingDate,
            createdBy: actor.id,
            description: `Store-paid fare accrued for ${trip.document_number}`,
            lines: this.posting('5040', '2020', trip.fare_amount_iqd),
          });
          fareAccrualId = accrual.id;
          if (trip.fare_settlement_method === 'cash_account') {
            const cash = await this.cashAccount(tx, trip.fare_cash_account_id!);
            const payment = await this.ledger.post(tx, {
              sourceType: 'external_driver_trip',
              sourceId: trip.id,
              event: 'fare_payment',
              documentDate: dates.documentDate,
              accountingDate: dates.accountingDate,
              createdBy: actor.id,
              description: `Fare paid for ${trip.document_number}`,
              lines: this.posting(
                '2020',
                cash.ledger_account.code,
                trip.fare_amount_iqd,
              ),
            });
            farePaymentId = payment.id;
          } else if (trip.fare_settlement_method === 'driver_keeps') {
            const available = expected.minus(received);
            if (trip.fare_amount_iqd.gt(available)) {
              throw conflict(
                'TRIP_FARE_EXCEEDS_UNSETTLED_CASH',
                'The driver cannot keep more fare than unsettled collected cash',
              );
            }
            let left = new Prisma.Decimal(trip.fare_amount_iqd);
            for (const collection of [...collections].sort(
              (a, b) => a.delivered_at.getTime() - b.delivered_at.getTime(),
            )) {
              if (!left.gt(0)) break;
              const cashAllocated = collection.cash_receipt_allocations.reduce(
                (sum, row) => sum.plus(row.amount_iqd),
                new Prisma.Decimal(0),
              );
              const priorNetting =
                collection.trip_settlement_allocations.reduce(
                  (sum, row) => sum.plus(row.amount_iqd),
                  new Prisma.Decimal(0),
                );
              const open = (
                collection.collected_amount ?? new Prisma.Decimal(0)
              )
                .minus(cashAllocated)
                .minus(priorNetting);
              const amount = Prisma.Decimal.min(open, left);
              if (amount.gt(0)) {
                await tx.externalDriverTripSettlementAllocation.create({
                  data: {
                    trip_id: trip.id,
                    collection_id: collection.id,
                    amount_iqd: amount,
                  },
                });
                left = left.minus(amount);
              }
            }
            if (left.gt(0)) {
              throw conflict(
                'TRIP_FARE_NETTING_INCOMPLETE',
                'Trip fare netting could not be fully allocated',
              );
            }
            const entry = await this.ledger.post(tx, {
              sourceType: 'external_driver_trip',
              sourceId: trip.id,
              event: 'fare_netting',
              documentDate: dates.documentDate,
              accountingDate: dates.accountingDate,
              createdBy: actor.id,
              description: `Fare netted against custody for ${trip.document_number}`,
              lines: this.posting('2020', '1020', trip.fare_amount_iqd),
            });
            fareNettingId = entry.id;
            netted = trip.fare_amount_iqd;
          }
        }
        const outstanding = expected.minus(received).minus(netted);
        const result = outstanding.isZero() ? 'settled' : 'settlement_open';
        await tx.externalDriverTrip.update({
          where: { id: trip.id },
          data: {
            status: 'closed',
            close_operation_id: input.operation_id,
            closed_by: actor.id,
            closed_at: eventAt,
            expected_cash_iqd: expected,
            received_cash_iqd: received,
            netted_fare_iqd: netted,
            outstanding_cash_iqd: outstanding,
            settlement_result: result,
            fare_accrual_journal_entry_id: fareAccrualId,
            fare_payment_journal_entry_id: farePaymentId,
            fare_netting_journal_entry_id: fareNettingId,
          },
        });
        await this.history.record(tx, {
          actorId: actor.id,
          operationId: input.operation_id,
          tripId: trip.id,
          type: 'closed',
          source: input.source,
          eventAt,
        });
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'external_driver_trip.close',
          entityType: 'external_driver_trip',
          entityId: trip.id,
          before: { status: 'in_progress' },
          after: {
            status: 'closed',
            expected_cash_iqd: expected.toString(),
            received_cash_iqd: received.toString(),
            netted_fare_iqd: netted.toString(),
            outstanding_cash_iqd: outstanding.toString(),
            settlement_result: result,
            source: input.source,
          },
        });
        return this.detailTx(tx, trip.id);
      },
    });
  }

  async list(query: ExternalDriverTripQueryDto) {
    if (query.date_from && query.date_to && query.date_from > query.date_to) {
      throw invalid(
        'DATE_RANGE_INVALID',
        'date_from must be on or before date_to',
      );
    }
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const where: Prisma.ExternalDriverTripWhereInput = {
      ...(query.driver_party_id
        ? { driver_party_id: query.driver_party_id }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.date_from || query.date_to
        ? {
            document_date: {
              ...(query.date_from
                ? { gte: parseBusinessDate(query.date_from) }
                : {}),
              ...(query.date_to
                ? { lte: parseBusinessDate(query.date_to) }
                : {}),
            },
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.externalDriverTrip.count({ where }),
      this.prisma.externalDriverTrip.findMany({
        where,
        include: tripInclude,
        orderBy: [
          { document_date: 'desc' },
          { created_at: 'desc' },
          { id: 'desc' },
        ],
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

  async get(id: string) {
    const row = await this.prisma.externalDriverTrip.findUnique({
      where: { id },
      include: tripInclude,
    });
    if (!row) throw new NotFoundException('External driver trip not found');
    return this.present(row);
  }

  async closePreview(id: string) {
    const trip = await this.prisma.externalDriverTrip.findUnique({
      where: { id },
      include: {
        orders: {
          include: {
            order: {
              include: {
                delivery_collection: {
                  include: {
                    cash_receipt_allocations: {
                      where: {
                        batch: { voucher: { reversal: { is: null } } },
                      },
                    },
                    trip_settlement_allocations: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!trip) throw new NotFoundException('External driver trip not found');
    const blockingOrders = trip.orders.flatMap((row) => {
      const collectionStatus = row.order.delivery_collection?.status ?? null;
      const resolvedStatus = [
        'ready_for_dispatch',
        'delivered',
        'returned',
        'cancelled',
      ].includes(row.order.status);
      if (resolvedStatus && collectionStatus !== 'unconfirmed') return [];
      return [
        {
          order_id: row.order.id,
          order_number: row.order.order_number,
          order_status: row.order.status,
          collection_status: collectionStatus,
          reason:
            collectionStatus === 'unconfirmed'
              ? 'collection_unconfirmed'
              : 'order_unresolved',
        },
      ];
    });
    const collections = trip.orders.flatMap((row) =>
      row.order.delivery_collection ? [row.order.delivery_collection] : [],
    );
    const expected = collections.reduce(
      (sum, collection) =>
        sum.plus(collection.collected_amount ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0),
    );
    const received = collections.reduce(
      (sum, collection) =>
        collection.cash_receipt_allocations.reduce(
          (inner, allocation) => inner.plus(allocation.amount_iqd),
          sum,
        ),
      new Prisma.Decimal(0),
    );
    const available = expected.minus(received);
    const wantsNetting =
      trip.fare_bearer === 'store' &&
      trip.fare_settlement_method === 'driver_keeps' &&
      trip.fare_amount_iqd.gt(0);
    const fareBlocker =
      wantsNetting && trip.fare_amount_iqd.gt(available)
        ? 'TRIP_FARE_EXCEEDS_UNSETTLED_CASH'
        : null;
    const netted =
      wantsNetting && !fareBlocker
        ? trip.fare_amount_iqd
        : new Prisma.Decimal(0);
    const difference = expected.minus(received).minus(netted);
    const postings: Array<{
      event: string;
      debit_account_code: string;
      credit_account_code: string;
      amount_iqd: number;
    }> = [];
    if (trip.fare_bearer === 'store' && trip.fare_amount_iqd.gt(0)) {
      postings.push({
        event: 'fare_accrual',
        debit_account_code: '5040',
        credit_account_code: '2020',
        amount_iqd: Number(trip.fare_amount_iqd),
      });
      if (trip.fare_settlement_method === 'cash_account') {
        const cash = await this.cashAccount(
          this.prisma,
          trip.fare_cash_account_id!,
        );
        postings.push({
          event: 'fare_payment',
          debit_account_code: '2020',
          credit_account_code: cash.ledger_account.code,
          amount_iqd: Number(trip.fare_amount_iqd),
        });
      } else if (wantsNetting && !fareBlocker) {
        postings.push({
          event: 'fare_netting',
          debit_account_code: '2020',
          credit_account_code: '1020',
          amount_iqd: Number(trip.fare_amount_iqd),
        });
      }
    }
    return {
      trip_id: trip.id,
      trip_status: trip.status,
      can_close:
        trip.status === 'in_progress' &&
        blockingOrders.length === 0 &&
        !fareBlocker,
      expected_cash_iqd: Number(expected),
      received_cash_iqd: Number(received),
      netted_fare_iqd: Number(netted),
      difference_iqd: Number(difference),
      settlement_result: difference.isZero() ? 'settled' : 'settlement_open',
      fare: {
        bearer: trip.fare_bearer,
        amount_iqd: Number(trip.fare_amount_iqd),
        settlement_method: trip.fare_settlement_method,
        outside_store_accounts: trip.fare_bearer === 'customer_direct',
        blocker_code: fareBlocker,
      },
      postings,
      blocking_orders: blockingOrders,
    };
  }

  private async detailTx(tx: Tx, id: string) {
    const row = await tx.externalDriverTrip.findUnique({
      where: { id },
      include: tripInclude,
    });
    if (!row) throw new NotFoundException('External driver trip not found');
    return this.present(row);
  }

  private present(
    row: Prisma.ExternalDriverTripGetPayload<{ include: typeof tripInclude }>,
  ) {
    const liveExpected = row.orders.reduce(
      (sum, item) =>
        sum.plus(item.order.delivery_collection?.collected_amount ?? 0),
      new Prisma.Decimal(0),
    );
    const liveReceived = row.orders.reduce((sum, item) => {
      const collection = item.order.delivery_collection;
      return collection
        ? collection.cash_receipt_allocations.reduce(
            (inner, allocation) => inner.plus(allocation.amount_iqd),
            sum,
          )
        : sum;
    }, new Prisma.Decimal(0));
    const liveNetted = row.settlement_allocations.reduce(
      (sum, item) => sum.plus(item.amount_iqd),
      new Prisma.Decimal(0),
    );
    const expected = row.expected_cash_iqd ?? liveExpected;
    const received = row.received_cash_iqd ?? liveReceived;
    const netted = row.netted_fare_iqd ?? liveNetted;
    const outstanding =
      row.outstanding_cash_iqd ?? expected.minus(received).minus(netted);
    return {
      id: row.id,
      document_number: row.document_number,
      status: row.status,
      driver: row.driver_party,
      fare: {
        bearer: row.fare_bearer,
        amount_iqd: Number(row.fare_amount_iqd),
        settlement_method: row.fare_settlement_method,
        cash_account: row.fare_cash_account,
        failure_cancellation_agreement: row.failure_cancellation_agreement,
        accrual_journal_entry_id: row.fare_accrual_journal_entry_id,
        payment_journal_entry_id: row.fare_payment_journal_entry_id,
        netting_journal_entry_id: row.fare_netting_journal_entry_id,
      },
      settlement: {
        expected_cash_iqd: Number(expected),
        received_cash_iqd: Number(received),
        netted_fare_iqd: Number(netted),
        outstanding_cash_iqd: Number(outstanding),
        result:
          row.settlement_result ??
          (outstanding.isZero() ? 'settled' : 'settlement_open'),
        allocations: row.settlement_allocations.map((allocation) => ({
          collection_id: allocation.collection_id,
          order_id: allocation.collection.order_id,
          order_number: allocation.collection.order.order_number,
          amount_iqd: Number(allocation.amount_iqd),
        })),
      },
      orders: row.orders.map((item) => ({
        id: item.order.id,
        order_number: item.order.order_number,
        status: item.order.status,
        version: item.order.version,
        amount_to_collect_iqd: Number(item.order.total),
        store_delivery_fee_iqd: Number(item.order.delivery_fee),
        fare_share_iqd: Number(item.fare_share_iqd),
        customer_acceptance_note: item.customer_acceptance_note,
        handover_time: item.handed_over_at,
        destination: {
          city: item.order.delivery_city,
          area: item.order.delivery_area,
          street: item.order.delivery_street,
          details: item.order.delivery_details,
        },
        items: item.order.items.map((line) => ({
          id: line.id,
          product_name_ar: line.product_name_ar,
          product_name_en: line.product_name_en,
          quantity: Number(line.quantity),
        })),
        delivery: item.order.delivery,
        collection: item.order.delivery_collection
          ? {
              id: item.order.delivery_collection.id,
              status: item.order.delivery_collection.status,
              due_amount_iqd: Number(item.order.delivery_collection.due_amount),
              collected_amount_iqd:
                item.order.delivery_collection.collected_amount === null
                  ? null
                  : Number(item.order.delivery_collection.collected_amount),
              shortfall_amount_iqd:
                item.order.delivery_collection.shortfall_amount === null
                  ? null
                  : Number(item.order.delivery_collection.shortfall_amount),
            }
          : null,
        exceptions: item.order.custody_exceptions.map((exception) => ({
          ...exception,
          amount_iqd: Number(exception.amount_iqd),
        })),
      })),
      events: row.events.map(({ recorder, ...event }) => ({
        ...event,
        recorded_by_name: actorDisplayName(recorder),
      })),
      document_date: businessDateText(row.document_date),
      accounting_date: businessDateText(row.accounting_date),
      backdate_reason: row.backdate_reason,
      created_by: row.created_by,
      created_by_name: actorDisplayName(row.creator),
      created_at: row.created_at,
      started_by: row.started_by,
      started_by_name: row.starter ? actorDisplayName(row.starter) : null,
      started_at: row.started_at,
      closed_by: row.closed_by,
      closed_by_name: row.closer ? actorDisplayName(row.closer) : null,
      closed_at: row.closed_at,
    };
  }

  private assertFareMethod(input: CreateExternalDriverTripDto) {
    if (
      input.fare_bearer === 'customer_direct' &&
      input.fare_settlement_method !== 'customer_direct'
    ) {
      throw invalid(
        'CUSTOMER_DIRECT_SETTLEMENT_REQUIRED',
        'A customer-direct fare must use customer_direct settlement',
      );
    }
    if (
      input.fare_bearer === 'store' &&
      input.fare_settlement_method === 'customer_direct'
    ) {
      throw invalid(
        'STORE_FARE_CUSTOMER_DIRECT_FORBIDDEN',
        'A store-paid fare cannot use customer_direct settlement',
      );
    }
    if (
      input.fare_settlement_method !== 'cash_account' &&
      input.fare_cash_account_id
    ) {
      throw invalid(
        'TRIP_CASH_ACCOUNT_NOT_ALLOWED',
        'fare_cash_account_id is only valid for cash-account settlement',
      );
    }
  }

  private async cashAccount(tx: Tx | PrismaService, id: string) {
    const row = await tx.cashAccount.findUnique({
      where: { id },
      include: { ledger_account: { select: { code: true } } },
    });
    if (!row) throw new NotFoundException('Cash account not found');
    if (!row.is_active || row.currency_code !== 'IQD') {
      throw conflict(
        'TRIP_FARE_ACCOUNT_INVALID',
        'Trip fare requires an active IQD cash account',
      );
    }
    return row;
  }

  private async tripOrderDelivery(tripId: string, orderId: string) {
    return this.tripOrderDeliveryTx(this.prisma, tripId, orderId);
  }

  private async tripOrderDeliveryTx(
    tx: Tx | PrismaService,
    tripId: string,
    orderId: string,
  ) {
    const row = await tx.externalDriverTripOrder.findUnique({
      where: { order_id: orderId },
      include: {
        trip: { select: { status: true } },
        order: { include: { delivery: true } },
      },
    });
    if (!row || row.trip_id !== tripId) {
      throw conflict(
        'TRIP_ORDER_NOT_FOUND',
        'Order is not part of this external-driver trip',
      );
    }
    if (row.trip.status !== 'in_progress') {
      throw conflict(
        'TRIP_NOT_IN_PROGRESS',
        'Trip order events require an in-progress trip',
      );
    }
    if (!row.order.delivery) {
      throw conflict(
        'TRIP_ORDER_HAS_NO_DELIVERY',
        'Trip order has no delivery',
      );
    }
    return row.order.delivery;
  }

  private nonNegative(value: string, field: string) {
    const amount = new Prisma.Decimal(value);
    if (!amount.isFinite() || amount.lt(0)) {
      throw invalid('AMOUNT_NEGATIVE', `${field} must be non-negative`);
    }
    return amount;
  }

  private posting(
    debit: string,
    credit: string,
    amount: Prisma.Decimal,
  ): PostingLine[] {
    return [
      {
        accountCode: debit,
        side: 'debit',
        baseAmount: amount.toString(),
        currencyCode: 'IQD',
        originalAmount: amount.toString(),
        exchangeRate: '1',
      },
      {
        accountCode: credit,
        side: 'credit',
        baseAmount: amount.toString(),
        currencyCode: 'IQD',
        originalAmount: amount.toString(),
        exchangeRate: '1',
      },
    ];
  }
}
