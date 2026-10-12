import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { DeliveryParty } from '../../generated/prisma/client';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { badRequest } from '../../common/http/api-error';
import { actorDisplayName, actorSelect } from '../../common/users/actor-name';
import { AuditService } from '../audit/audit.service';
import {
  businessDate,
  businessDateDifference,
  businessDateText,
} from '../finance/business-date';
import {
  CreateExternalDriverDto,
  CustodyOverviewQueryDto,
  CustodyOverviewSort,
  DeliveryPartyKind,
  DeliveryPartyQueryDto,
  PartyCashActivityQueryDto,
  PartyStatementQueryDto,
  SortDirection,
  UpdateExternalDriverDto,
} from './dto/delivery-party.dto';

const partySelect = {
  id: true,
  kind: true,
  user_id: true,
  name: true,
  phone: true,
  vehicle_number: true,
  description: true,
  notes: true,
  is_active: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.DeliveryPartySelect;

@Injectable()
export class DeliveryPartiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: DeliveryPartyQueryDto, canViewCost = false) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const q = query.q?.trim();
    const where = this.partyWhere(query, q);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.deliveryParty.count({ where }),
      this.prisma.deliveryParty.findMany({
        where,
        select: partySelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    const summaries = await this.custodySummaries(
      rows.map((row) => row.id),
      canViewCost,
    );
    return {
      page,
      per_page: perPage,
      total,
      data: rows.map((row) => ({
        ...row,
        custody_summary: summaries.get(row.id)!,
      })),
    };
  }

  async custodyOverview(query: CustodyOverviewQueryDto, canViewCost: boolean) {
    if (query.sort_by === CustodyOverviewSort.GoodsValue && !canViewCost) {
      throw new ForbiddenException({
        status: 403,
        code: 'COST_VIEW_REQUIRED',
        message: 'cost.view is required to sort by goods value',
        errors: [],
      });
    }
    const q = query.q?.trim();
    const parties = await this.prisma.deliveryParty.findMany({
      where: this.partyWhere(query, q),
      select: partySelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    const summaries = await this.custodySummaries(
      parties.map((party) => party.id),
      canViewCost,
    );
    const rows = parties.map((party) => ({
      ...party,
      custody_summary: summaries.get(party.id)!,
    }));
    const key = query.sort_by ?? CustodyOverviewSort.Name;
    const direction = query.sort_direction === SortDirection.Desc ? -1 : 1;
    rows.sort((left, right) => {
      if (key === CustodyOverviewSort.Name) {
        return (
          direction * left.name.localeCompare(right.name) ||
          left.id.localeCompare(right.id)
        );
      }
      const leftValue = left.custody_summary[key] ?? -1;
      const rightValue = right.custody_summary[key] ?? -1;
      return (
        direction * (Number(leftValue) - Number(rightValue)) ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id)
      );
    });
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    return {
      page,
      per_page: perPage,
      total: rows.length,
      data: rows.slice((page - 1) * perPage, page * perPage),
    };
  }

  async get(id: string) {
    const party = await this.prisma.deliveryParty.findUnique({
      where: { id },
      select: partySelect,
    });
    if (!party) throw new NotFoundException('Delivery party not found');
    return party;
  }

  async createExternal(actorId: string, input: CreateExternalDriverDto) {
    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.deliveryParty.count({
        where: { phone: input.phone.trim() },
      });
      const party = await tx.deliveryParty.create({
        data: {
          kind: DeliveryPartyKind.ExternalDriver,
          name: input.name.trim(),
          phone: input.phone.trim(),
          vehicle_number: input.vehicle_number?.trim() || null,
          description: input.description?.trim() || null,
          notes: input.notes?.trim() || null,
        },
        select: partySelect,
      });
      await this.audit.record(tx, {
        actorId,
        action: 'external_driver.create',
        entityType: 'delivery_party',
        entityId: party.id,
        after: party,
      });
      return { ...party, duplicate_phone_warning: duplicate > 0 };
    });
  }

  async updateExternal(
    actorId: string,
    id: string,
    input: UpdateExternalDriverDto,
  ) {
    if (!Object.keys(input).length) {
      throw new UnprocessableEntityException(
        'At least one external driver field is required',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.deliveryParty.findUnique({ where: { id } });
      this.assertExternal(existing);
      const phone = input.phone?.trim();
      const duplicate = phone
        ? await tx.deliveryParty.count({
            where: { phone, id: { not: id } },
          })
        : 0;
      const party = await tx.deliveryParty.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(phone === undefined ? {} : { phone }),
          ...(input.vehicle_number === undefined
            ? {}
            : { vehicle_number: input.vehicle_number.trim() || null }),
          ...(input.description === undefined
            ? {}
            : { description: input.description.trim() || null }),
          ...(input.notes === undefined
            ? {}
            : { notes: input.notes.trim() || null }),
          ...(input.is_active === undefined
            ? {}
            : { is_active: input.is_active }),
          updated_at: new Date(),
        },
        select: partySelect,
      });
      await this.audit.record(tx, {
        actorId,
        action: 'external_driver.update',
        entityType: 'delivery_party',
        entityId: id,
        before: existing,
        after: party,
      });
      return { ...party, duplicate_phone_warning: duplicate > 0 };
    });
  }

  async removeExternal(actorId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.deliveryParty.findUnique({ where: { id } });
      this.assertExternal(existing);
      const [deliveries, movements, holdings, attempts, retrievals, trips] =
        await Promise.all([
          tx.delivery.count({ where: { agent_id: id } }),
          tx.stockMovement.count({ where: { custody_party_id: id } }),
          tx.custodyHolding.count({ where: { custody_party_id: id } }),
          tx.deliveryAttempt.count({ where: { party_id: id } }),
          tx.retrieval.count({ where: { custody_party_id: id } }),
          tx.externalDriverTrip.count({ where: { driver_party_id: id } }),
        ]);
      const used =
        deliveries + movements + holdings + attempts + retrievals + trips > 0;
      if (used) {
        await tx.deliveryParty.update({
          where: { id },
          data: { is_active: false, updated_at: new Date() },
        });
      } else {
        await tx.deliveryParty.delete({ where: { id } });
      }
      await this.audit.record(tx, {
        actorId,
        action: used ? 'external_driver.deactivate' : 'external_driver.delete',
        entityType: 'delivery_party',
        entityId: id,
        before: existing,
        after: used ? { is_active: false } : undefined,
      });
      return { id, disposition: used ? 'deactivated' : 'deleted' };
    });
  }

  async custody(id: string, canViewCost: boolean) {
    const party = await this.get(id);
    const rows = await this.prisma.custodyHolding.findMany({
      where: {
        custody_party_id: id,
        status: 'in_custody',
        remaining_quantity: { gt: 0 },
      },
      include: {
        order: { select: { id: true, order_number: true } },
        batch: {
          include: {
            variant: {
              select: {
                id: true,
                sku: true,
                product: { select: { id: true, name_en: true, name_ar: true } },
              },
            },
          },
        },
      },
      orderBy: [{ issued_at: 'asc' }, { id: 'asc' }],
    });
    const cashBalance = (await this.cashCustodyBalances([id])).get(id)!;
    const today = businessDate();
    const goods = rows.map((row) => {
      const quantity = Number(row.remaining_quantity);
      const unitCost = Number(row.unit_cost_iqd);
      return {
        holding_id: row.id,
        order: row.order,
        delivery_id: row.delivery_id,
        batch_id: row.batch_id,
        lot_number: row.batch.lot_number,
        variant_id: row.batch.variant.id,
        sku: row.batch.variant.sku,
        product: row.batch.variant.product,
        quantity,
        issued_at: row.issued_at,
        age_days: businessDateDifference(today, businessDate(row.issued_at)),
        ...(canViewCost
          ? { unit_cost_iqd: unitCost, value_iqd: quantity * unitCost }
          : {}),
      };
    });
    return {
      party,
      goods: {
        quantity: goods.reduce((sum, row) => sum + row.quantity, 0),
        ...(canViewCost
          ? {
              value_iqd: goods.reduce(
                (sum, row) => sum + (row.value_iqd ?? 0),
                0,
              ),
            }
          : {}),
        oldest_age_days: goods.length
          ? Math.max(...goods.map((row) => row.age_days))
          : null,
        lines: goods,
      },
      cash: {
        currency: 'IQD',
        amount: Number(cashBalance.amount.toDecimalPlaces(4)),
        oldest_age_days: cashBalance.oldestAgeDays,
      },
    };
  }

  async custodyForUser(userId: string) {
    const party = await this.prisma.deliveryParty.findUnique({
      where: { user_id: userId },
      select: { id: true },
    });
    if (!party) throw new NotFoundException('Delivery party not found');
    return this.custody(party.id, false);
  }

  async statement(
    id: string,
    query: PartyStatementQueryDto,
    canViewCost: boolean,
  ) {
    const result = await this.combinedStatement(id, query, canViewCost);
    const { cash_activity: cashActivity, ...statement } = result;
    void cashActivity;
    return statement;
  }

  async cashActivity(id: string, query: PartyCashActivityQueryDto) {
    const result = await this.combinedStatement(id, query, false);
    return {
      party: result.party,
      page: result.page,
      per_page: result.per_page,
      total: result.cash_activity.total,
      data: result.cash_activity.data,
    };
  }

  private async combinedStatement(
    id: string,
    query: PartyStatementQueryDto,
    canViewCost: boolean,
  ) {
    const party = await this.get(id);
    if (query.from && query.to && query.from > query.to) {
      throw badRequest('DATE_RANGE_INVALID', 'from must be on or before to');
    }
    const [movements, cashCollections, cashReceipts, exceptions, trips] =
      await Promise.all([
        this.prisma.stockMovement.findMany({
          where: {
            custody_party_id: id,
            OR: [
              {
                type: {
                  in: [
                    'issue_to_custody',
                    'custody_to_sold',
                    'custody_exception',
                    'custody_exception_reversal',
                  ],
                },
              },
              {
                type: 'return_in',
                NOT: { source_type: 'custody_exception' },
              },
            ],
          },
          include: {
            batch: {
              select: { lot_number: true, variant: { select: { sku: true } } },
            },
          },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.deliveryCollection.findMany({
          where: {
            party_id: id,
            status: { in: ['confirmed_full', 'confirmed_short'] },
            collected_amount: { not: null },
          },
          include: {
            order: { select: { id: true, order_number: true } },
            cash_receipt_allocations: {
              where: { batch: { voucher: { reversal: { is: null } } } },
              select: { amount_iqd: true },
            },
            trip_settlement_allocations: {
              include: {
                trip: {
                  select: { id: true, document_number: true, closed_at: true },
                },
              },
            },
          },
        }),
        this.prisma.cashReceiptVoucher.findMany({
          where: { party_id: id },
          include: {
            allocation_batches: {
              include: {
                allocations: {
                  include: {
                    collection: {
                      include: {
                        order: { select: { id: true, order_number: true } },
                      },
                    },
                  },
                },
              },
            },
            reversal: true,
          },
        }),
        this.prisma.custodyException.findMany({
          where: { party_id: id },
          include: {
            order: { select: { id: true, order_number: true } },
            reversal: true,
          },
        }),
        this.prisma.externalDriverTrip.findMany({
          where: { driver_party_id: id },
          select: {
            id: true,
            document_number: true,
            status: true,
            fare_bearer: true,
            fare_amount_iqd: true,
            fare_settlement_method: true,
            expected_cash_iqd: true,
            received_cash_iqd: true,
            netted_fare_iqd: true,
            outstanding_cash_iqd: true,
            settlement_result: true,
            document_date: true,
            created_by: true,
            creator: { select: actorSelect },
            started_by: true,
            starter: { select: actorSelect },
            started_at: true,
            closed_by: true,
            closer: { select: actorSelect },
            closed_at: true,
            _count: { select: { orders: true } },
          },
          orderBy: [{ document_date: 'desc' }, { created_at: 'desc' }],
        }),
      ]);
    const retrievalIds = movements
      .filter((row) => row.source_type === 'retrieval' && row.source_id)
      .map((row) => row.source_id!);
    const retrievals = retrievalIds.length
      ? await this.prisma.retrieval.findMany({
          where: { id: { in: retrievalIds } },
          select: { id: true, order_id: true },
        })
      : [];
    const retrievalOrders = new Map(
      retrievals.map((row) => [row.id, row.order_id]),
    );
    const orderIds = [
      ...new Set(
        movements
          .map((row) =>
            row.source_type === 'order'
              ? row.source_id
              : row.source_type === 'custody_exception' ||
                  row.source_type === 'custody_exception_reversal'
                ? exceptions.find(
                    (exception) =>
                      exception.id === row.source_id ||
                      exception.reversal?.id === row.source_id,
                  )?.order_id
                : row.source_id
                  ? retrievalOrders.get(row.source_id)
                  : undefined,
          )
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const orders = orderIds.length
      ? await this.prisma.order.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, order_number: true },
        })
      : [];
    const orderNumbers = new Map(
      orders.map((row) => [row.id, row.order_number]),
    );
    let runningQuantity = 0;
    let runningValue = 0;
    const all = movements.map((row) => {
      const direction = [
        'issue_to_custody',
        'custody_exception_reversal',
      ].includes(row.type)
        ? 1
        : -1;
      const quantity = direction * Number(row.quantity);
      const value = quantity * Number(row.unit_cost_iqd);
      runningQuantity += quantity;
      runningValue += value;
      const orderId =
        row.source_type === 'order'
          ? row.source_id
          : row.source_type === 'custody_exception' ||
              row.source_type === 'custody_exception_reversal'
            ? (exceptions.find(
                (exception) =>
                  exception.id === row.source_id ||
                  exception.reversal?.id === row.source_id,
              )?.order_id ?? null)
            : row.source_id
              ? (retrievalOrders.get(row.source_id) ?? null)
              : null;
      return {
        id: row.id,
        event: row.type,
        occurred_at: row.created_at,
        business_date: businessDateText(row.created_at),
        order_id: orderId,
        order_number: orderId ? (orderNumbers.get(orderId) ?? null) : null,
        batch_id: row.batch_id,
        lot_number: row.batch.lot_number,
        sku: row.batch.variant.sku,
        quantity,
        running_quantity: runningQuantity,
        ...(canViewCost
          ? { value_iqd: value, running_value_iqd: runningValue }
          : {}),
      };
    });
    const filtered = all.filter(
      (row) =>
        (!query.from || row.business_date >= query.from) &&
        (!query.to || row.business_date <= query.to) &&
        (!query.order_id || row.order_id === query.order_id),
    );
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const cashEvents = [
      ...cashCollections.map((collection) => {
        const allocated = collection.cash_receipt_allocations.reduce(
          (sum, allocation) => sum.plus(allocation.amount_iqd),
          new Prisma.Decimal(0),
        );
        const netted = collection.trip_settlement_allocations.reduce(
          (sum, allocation) => sum.plus(allocation.amount_iqd),
          new Prisma.Decimal(0),
        );
        const collected = collection.collected_amount!;
        return {
          id: collection.id,
          event: 'collection_confirmed' as const,
          occurred_at: collection.confirmed_at ?? collection.delivered_at,
          business_date: businessDateText(collection.accounting_date),
          order_id: collection.order_id,
          order_number: collection.order.order_number,
          voucher_id: null,
          voucher_document_number: null,
          amount_iqd: Number(collected),
          allocated_amount_iqd: Number(allocated.plus(netted)),
          unsettled_amount_iqd: Number(
            Prisma.Decimal.max(0, collected.minus(allocated).minus(netted)),
          ),
          allocation_orders: [] as Array<{
            order_id: string;
            order_number: string;
            amount_iqd: number;
          }>,
        };
      }),
      ...cashReceipts.flatMap((receipt) => {
        const allocationOrders = receipt.allocation_batches.flatMap((batch) =>
          batch.allocations.map((allocation) => ({
            order_id: allocation.collection.order_id,
            order_number: allocation.collection.order.order_number,
            amount_iqd: Number(allocation.amount_iqd),
          })),
        );
        const received = {
          id: receipt.id,
          event: 'cash_received' as const,
          occurred_at: receipt.created_at,
          business_date: businessDateText(receipt.document_date),
          order_id: null,
          order_number: null,
          voucher_id: receipt.id,
          voucher_document_number: receipt.document_number,
          amount_iqd: -Number(receipt.amount_iqd),
          allocated_amount_iqd: allocationOrders.reduce(
            (sum, allocation) => sum + allocation.amount_iqd,
            0,
          ),
          unsettled_amount_iqd: 0,
          allocation_orders: allocationOrders,
        };
        return receipt.reversal
          ? [
              received,
              {
                ...received,
                id: receipt.reversal.id,
                event: 'cash_receipt_reversed' as const,
                occurred_at: receipt.reversal.created_at,
                business_date: businessDateText(receipt.reversal.document_date),
                amount_iqd: Number(receipt.amount_iqd),
              },
            ]
          : [received];
      }),
      ...cashCollections.flatMap((collection) =>
        collection.trip_settlement_allocations.map((allocation) => ({
          id: allocation.id,
          event: 'trip_fare_netted' as const,
          occurred_at: allocation.trip.closed_at ?? collection.delivered_at,
          business_date: businessDateText(
            allocation.trip.closed_at ?? collection.accounting_date,
          ),
          order_id: collection.order_id,
          order_number: collection.order.order_number,
          voucher_id: allocation.trip.id,
          voucher_document_number: allocation.trip.document_number,
          amount_iqd: -Number(allocation.amount_iqd),
          allocated_amount_iqd: Number(allocation.amount_iqd),
          unsettled_amount_iqd: 0,
          allocation_orders: [
            {
              order_id: collection.order_id,
              order_number: collection.order.order_number,
              amount_iqd: Number(allocation.amount_iqd),
            },
          ],
        })),
      ),
      ...exceptions.flatMap((exception) => {
        const base = {
          id: exception.id,
          event:
            exception.type === 'goods_loss' &&
            exception.liability_bearer === 'party'
              ? ('custody_exception_party_liability' as const)
              : ('custody_exception' as const),
          occurred_at: exception.created_at,
          business_date: businessDateText(exception.document_date),
          order_id: exception.order_id,
          order_number: exception.order.order_number,
          voucher_id: null,
          voucher_document_number: exception.document_number,
          amount_iqd:
            exception.type === 'goods_loss' &&
            exception.liability_bearer === 'party'
              ? Number(exception.amount_iqd)
              : 0,
          allocated_amount_iqd: 0,
          unsettled_amount_iqd: 0,
          allocation_orders: [] as Array<{
            order_id: string;
            order_number: string;
            amount_iqd: number;
          }>,
        };
        return exception.reversal
          ? [
              base,
              {
                ...base,
                id: exception.reversal.id,
                event: 'custody_exception_reversed' as const,
                occurred_at: exception.reversal.created_at,
                business_date: businessDateText(
                  exception.reversal.document_date,
                ),
                amount_iqd: -base.amount_iqd,
              },
            ]
          : [base];
      }),
    ].sort(
      (left, right) =>
        left.business_date.localeCompare(right.business_date) ||
        left.occurred_at.getTime() - right.occurred_at.getTime() ||
        left.id.localeCompare(right.id),
    );
    let runningCash = 0;
    const cashAll = cashEvents.map((event) => {
      runningCash += event.amount_iqd;
      return { ...event, running_cash_iqd: runningCash };
    });
    const cashFiltered = cashAll.filter(
      (row) =>
        (!query.from || row.business_date >= query.from) &&
        (!query.to || row.business_date <= query.to) &&
        (!query.order_id ||
          row.order_id === query.order_id ||
          row.allocation_orders.some(
            (allocation) => allocation.order_id === query.order_id,
          )),
    );
    return {
      party,
      page,
      per_page: perPage,
      total: filtered.length,
      data: filtered.slice((page - 1) * perPage, page * perPage),
      cash_activity: {
        total: cashFiltered.length,
        data: cashFiltered.slice((page - 1) * perPage, page * perPage),
      },
      trips: trips.map((trip) => ({
        id: trip.id,
        document_number: trip.document_number,
        status: trip.status,
        fare_bearer: trip.fare_bearer,
        fare_amount_iqd: Number(trip.fare_amount_iqd),
        fare_settlement_method: trip.fare_settlement_method,
        expected_cash_iqd:
          trip.expected_cash_iqd === null
            ? null
            : Number(trip.expected_cash_iqd),
        received_cash_iqd:
          trip.received_cash_iqd === null
            ? null
            : Number(trip.received_cash_iqd),
        netted_fare_iqd:
          trip.netted_fare_iqd === null ? null : Number(trip.netted_fare_iqd),
        outstanding_cash_iqd:
          trip.outstanding_cash_iqd === null
            ? null
            : Number(trip.outstanding_cash_iqd),
        settlement_result: trip.settlement_result,
        order_count: trip._count.orders,
        document_date: businessDateText(trip.document_date),
        created_by: trip.created_by,
        created_by_name: actorDisplayName(trip.creator),
        started_by: trip.started_by,
        started_by_name: actorDisplayName(trip.starter),
        started_at: trip.started_at,
        closed_by: trip.closed_by,
        closed_by_name: actorDisplayName(trip.closer),
        closed_at: trip.closed_at,
      })),
    };
  }

  async heldOrders(id: string) {
    const party = await this.get(id);
    const holdings = await this.prisma.custodyHolding.findMany({
      where: {
        custody_party_id: id,
        status: 'in_custody',
        remaining_quantity: { gt: 0 },
      },
      include: {
        order: { select: { id: true, order_number: true, status: true } },
      },
      orderBy: [{ issued_at: 'asc' }, { id: 'asc' }],
    });
    const grouped = new Map<
      string,
      {
        id: string;
        order_number: string;
        status: string;
        delivery_id: string;
        quantity: number;
        held_since: Date;
        age_days: number;
      }
    >();
    const today = businessDate();
    for (const holding of holdings) {
      const current = grouped.get(holding.order_id);
      const age = businessDateDifference(
        today,
        businessDate(holding.issued_at),
      );
      if (current) {
        current.quantity += Number(holding.remaining_quantity);
        current.age_days = Math.max(current.age_days, age);
        if (holding.issued_at < current.held_since)
          current.held_since = holding.issued_at;
      } else {
        grouped.set(holding.order_id, {
          ...holding.order,
          delivery_id: holding.delivery_id,
          quantity: Number(holding.remaining_quantity),
          held_since: holding.issued_at,
          age_days: age,
        });
      }
    }
    return { party, data: [...grouped.values()] };
  }

  private partyWhere(
    query: DeliveryPartyQueryDto,
    q = query.q?.trim(),
  ): Prisma.DeliveryPartyWhereInput {
    return {
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.active === undefined ? {} : { is_active: query.active }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
              { vehicle_number: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private async custodySummaries(ids: string[], canViewCost: boolean) {
    type Summary = {
      goods_value_iqd?: number;
      cash_held: number;
      oldest_item_age_days: number | null;
      orders_held: number;
    };
    const summaries = new Map<string, Summary>(
      ids.map((id) => [
        id,
        {
          ...(canViewCost ? { goods_value_iqd: 0 } : {}),
          cash_held: 0,
          oldest_item_age_days: null,
          orders_held: 0,
        },
      ]),
    );
    if (!ids.length) return summaries;
    const [holdings, cashBalances] = await Promise.all([
      this.prisma.custodyHolding.findMany({
        where: {
          custody_party_id: { in: ids },
          status: 'in_custody',
          remaining_quantity: { gt: 0 },
        },
        select: {
          custody_party_id: true,
          order_id: true,
          remaining_quantity: true,
          unit_cost_iqd: true,
          issued_at: true,
        },
      }),
      this.cashCustodyBalances(ids),
    ]);
    const today = businessDate();
    const orders = new Map<string, Set<string>>();
    const recordAge = (summary: Summary, at: Date) => {
      const age = businessDateDifference(today, businessDate(at));
      summary.oldest_item_age_days = Math.max(
        summary.oldest_item_age_days ?? 0,
        age,
      );
    };
    for (const holding of holdings) {
      const summary = summaries.get(holding.custody_party_id)!;
      if (canViewCost) {
        summary.goods_value_iqd =
          (summary.goods_value_iqd ?? 0) +
          Number(holding.remaining_quantity) * Number(holding.unit_cost_iqd);
      }
      const partyOrders = orders.get(holding.custody_party_id) ?? new Set();
      partyOrders.add(holding.order_id);
      orders.set(holding.custody_party_id, partyOrders);
      recordAge(summary, holding.issued_at);
    }
    for (const [id, balance] of cashBalances) {
      const summary = summaries.get(id)!;
      summary.cash_held = Number(balance.amount.toDecimalPlaces(4));
      if (balance.oldestAgeDays !== null) {
        summary.oldest_item_age_days = Math.max(
          summary.oldest_item_age_days ?? 0,
          balance.oldestAgeDays,
        );
      }
    }
    for (const [id, partyOrders] of orders) {
      summaries.get(id)!.orders_held = partyOrders.size;
    }
    return summaries;
  }

  /**
   * Active allocations settle named orders. Any physically received but still
   * unallocated remainder also leaves custody, so apply that remainder FIFO
   * only for custody ageing while preserving its explicit unallocated status.
   */
  private async cashCustodyBalances(ids: string[]) {
    type Balance = {
      amount: Prisma.Decimal;
      oldestAgeDays: number | null;
    };
    const result = new Map<string, Balance>(
      ids.map((id) => [
        id,
        { amount: new Prisma.Decimal(0), oldestAgeDays: null },
      ]),
    );
    if (!ids.length) return result;
    const [collections, receipts, liabilities] = await Promise.all([
      this.prisma.deliveryCollection.findMany({
        where: {
          party_id: { in: ids },
          status: { in: ['confirmed_full', 'confirmed_short'] },
          collected_amount: { not: null },
        },
        select: {
          id: true,
          party_id: true,
          collected_amount: true,
          confirmed_at: true,
          delivered_at: true,
          cash_receipt_allocations: {
            where: { batch: { voucher: { reversal: { is: null } } } },
            select: { amount_iqd: true },
          },
          trip_settlement_allocations: { select: { amount_iqd: true } },
        },
      }),
      this.prisma.cashReceiptVoucher.findMany({
        where: { party_id: { in: ids }, reversal: { is: null } },
        select: {
          party_id: true,
          amount_iqd: true,
          allocation_batches: {
            select: {
              allocations: { select: { amount_iqd: true } },
            },
          },
        },
      }),
      this.prisma.custodyException.findMany({
        where: {
          party_id: { in: ids },
          type: 'goods_loss',
          liability_bearer: 'party',
          reversal: { is: null },
        },
        select: {
          id: true,
          party_id: true,
          amount_iqd: true,
          created_at: true,
        },
      }),
    ]);
    const unallocated = new Map<string, Prisma.Decimal>(
      ids.map((id) => [id, new Prisma.Decimal(0)]),
    );
    for (const receipt of receipts) {
      const allocated = receipt.allocation_batches.reduce(
        (sum, batch) =>
          batch.allocations.reduce(
            (inner, allocation) => inner.plus(allocation.amount_iqd),
            sum,
          ),
        new Prisma.Decimal(0),
      );
      unallocated.set(
        receipt.party_id,
        unallocated
          .get(receipt.party_id)!
          .plus(receipt.amount_iqd.minus(allocated)),
      );
    }
    const sources = [
      ...collections.map((collection) => ({
        id: collection.id,
        party_id: collection.party_id,
        occurred_at: collection.confirmed_at ?? collection.delivered_at,
        amount: Prisma.Decimal.max(
          0,
          collection
            .collected_amount!.minus(
              collection.cash_receipt_allocations.reduce(
                (sum, allocation) => sum.plus(allocation.amount_iqd),
                new Prisma.Decimal(0),
              ),
            )
            .minus(
              collection.trip_settlement_allocations.reduce(
                (sum, allocation) => sum.plus(allocation.amount_iqd),
                new Prisma.Decimal(0),
              ),
            ),
        ),
      })),
      ...liabilities.map((exception) => ({
        id: exception.id,
        party_id: exception.party_id,
        occurred_at: exception.created_at,
        amount: exception.amount_iqd,
      })),
    ].sort(
      (left, right) =>
        left.occurred_at.getTime() - right.occurred_at.getTime() ||
        left.id.localeCompare(right.id),
    );
    const today = businessDate();
    for (const source of sources) {
      let remaining = source.amount;
      const unapplied = unallocated.get(source.party_id)!;
      if (remaining.gt(0) && unapplied.gt(0)) {
        const consumed = Prisma.Decimal.min(remaining, unapplied);
        remaining = remaining.minus(consumed);
        unallocated.set(source.party_id, unapplied.minus(consumed));
      }
      if (!remaining.gt(0)) continue;
      const balance = result.get(source.party_id)!;
      balance.amount = balance.amount.plus(remaining);
      const age = businessDateDifference(
        today,
        businessDate(source.occurred_at),
      );
      balance.oldestAgeDays = Math.max(balance.oldestAgeDays ?? 0, age);
    }
    return result;
  }

  private assertExternal(
    party: DeliveryParty | null,
  ): asserts party is DeliveryParty {
    if (!party || party.kind !== 'external_driver') {
      throw new NotFoundException('External driver not found');
    }
  }
}
