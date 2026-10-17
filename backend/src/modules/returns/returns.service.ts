import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  conflict,
  forbidden,
  invalid,
  notFound,
} from '../../common/http/api-error';
import {
  assertDifferentActor,
  separationOfDutiesLevel,
} from '../../common/access/separation-of-duties';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  addBusinessDateDays,
  businessDate,
  businessDateDifference,
  businessDateText,
  parseBusinessDate,
} from '../finance/business-date';
import { DateRulesService } from '../finance/date-rules.service';
import { DocumentNumberService } from '../finance/document-number.service';
import { LedgerService } from '../finance/ledger.service';
import { OperationService } from '../finance/operation.service';
import { materializeCustodyExceptionPosting } from '../finance/posting-scenarios';
import { minorUnitsToMoney, moneyToMinorUnits } from '../catalog/pricing';
import {
  ApproveReturnDto,
  InspectReturnDto,
  ReceiveReturnDto,
  RefundReturnDto,
  RequestReturnDto,
  ReturnQueryDto,
  ReturnSortBy,
  StaffCreateReturnDto,
} from './dto/return.dto';

type Tx = Prisma.TransactionClient;
type Actor = { id: string; permissions: readonly string[] };

const returnInclude = {
  items: {
    include: {
      order_item: {
        select: {
          product_name_ar: true,
          product_name_en: true,
          variant_id: true,
        },
      },
      inspection_location: {
        select: { id: true, code: true, is_sellable: true },
      },
    },
    orderBy: { id: 'asc' as const },
  },
  order: { select: { id: true, order_number: true, total: true } },
  refund: true,
  events: { orderBy: [{ created_at: 'asc' as const }, { id: 'asc' as const }] },
  refund_payments: {
    include: {
      cash_account: { select: { id: true, name: true } },
      collection: { select: { id: true, party_id: true } },
    },
    orderBy: [{ created_at: 'asc' as const }, { id: 'asc' as const }],
  },
  postings: {
    include: { journal_entry: { select: { id: true, document_number: true } } },
    orderBy: { role: 'asc' as const },
  },
} satisfies Prisma.ReturnInclude;
type ReturnRow = Prisma.ReturnGetPayload<{ include: typeof returnInclude }>;

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly dates: DateRulesService,
    private readonly numbers: DocumentNumberService,
    private readonly ledger: LedgerService,
    private readonly operations: OperationService,
    private readonly notifications?: NotificationsService,
  ) {}

  listOwned(userId: string, query: ReturnQueryDto) {
    return this.list({ user_id: userId }, query);
  }

  queue(query: ReturnQueryDto) {
    return this.list({}, query);
  }

  getOwned(userId: string, id: string) {
    return this.get(id, { user_id: userId });
  }

  getStaff(id: string) {
    return this.get(id);
  }

  private async list(scope: Prisma.ReturnWhereInput, query: ReturnQueryDto) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const where: Prisma.ReturnWhereInput = {
      ...scope,
      ...(query.status ? { status: query.status } : {}),
      ...(query.customer_id ? { user_id: query.customer_id } : {}),
      ...(query.order_id ? { order_id: query.order_id } : {}),
      ...(query.date_from || query.date_to
        ? {
            document_date: {
              ...(query.date_from
                ? { gte: parseBusinessDate(query.date_from) }
                : {}),
              ...(query.date_to
                ? {
                    lt: addBusinessDateDays(
                      parseBusinessDate(query.date_to),
                      1,
                    ),
                  }
                : {}),
            },
          }
        : {}),
    };
    const direction = query.sort_direction ?? 'desc';
    const orderBy: Prisma.ReturnOrderByWithRelationInput[] =
      query.sort_by === ReturnSortBy.Number
        ? [{ document_number: direction }, { id: direction }]
        : query.sort_by === ReturnSortBy.Refund
          ? [{ refund_amount: direction }, { id: direction }]
          : [{ created_at: direction }, { id: direction }];
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.return.count({ where }),
      this.prisma.return.findMany({
        where,
        include: returnInclude,
        orderBy,
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

  request(userId: string, role: string, input: RequestReturnDto) {
    if (role !== 'customer') {
      throw forbidden('CUSTOMER_ACCOUNT_REQUIRED', 'Customer account required');
    }
    return this.create(
      { id: userId, permissions: [] },
      userId,
      'customer',
      input,
    );
  }

  createStaff(actor: Actor, input: StaffCreateReturnDto) {
    return this.create(actor, input.customer_id, 'staff', input);
  }

  private async create(
    actor: Actor,
    customerId: string,
    source: 'customer' | 'staff',
    input: RequestReturnDto,
  ) {
    const operationId = input.operation_id;
    const today = businessDate();
    const result = await this.operations.execute({
      userId: actor.id,
      operationId,
      endpoint: source === 'customer' ? 'POST /returns' : 'POST /returns/staff',
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${input.order_id}::uuid FOR UPDATE`;
        const order = await tx.order.findFirst({
          where: { id: input.order_id, user_id: customerId },
          include: {
            items: {
              include: {
                custody_holdings: { where: { status: 'sold' } },
                custody_exception_lines: {
                  where: {
                    exception: {
                      type: 'return_against_uncollected',
                      reversal: { is: null },
                    },
                  },
                },
              },
            },
            deliveries: {
              where: { delivered_at: { not: null } },
              orderBy: { delivered_at: 'desc' },
              take: 1,
            },
            loyalty_ledger: true,
          },
        });
        if (!order) throw notFound('ORDER_NOT_FOUND', 'Order not found');
        if (
          !['delivered', 'return_requested', 'returned'].includes(order.status)
        ) {
          throw conflict(
            'RETURN_ORDER_NOT_DELIVERED',
            'Only delivered orders can be returned',
          );
        }
        const deliveredAt = order.deliveries[0]?.delivered_at;
        if (!deliveredAt) {
          throw conflict(
            'RETURN_DELIVERY_NOT_FOUND',
            'The delivery record is missing',
          );
        }
        const windowRow = await tx.storeSetting.findUnique({
          where: { key: 'return_window_days' },
        });
        const windowDays = Number(windowRow?.value ?? 14);
        if (
          businessDateDifference(today, businessDate(deliveredAt)) > windowDays
        ) {
          throw conflict(
            'RETURN_WINDOW_EXPIRED',
            `The ${windowDays}-day return window has expired`,
          );
        }
        if (!input.items.length)
          throw invalid('RETURN_ITEMS_REQUIRED', 'Return requires items');
        const requestedIds = input.items.map((item) => item.order_item_id);
        if (new Set(requestedIds).size !== requestedIds.length) {
          throw invalid(
            'RETURN_ITEM_DUPLICATE',
            'Each order item may appear once',
          );
        }
        const previous = await tx.returnItem.findMany({
          where: { order_item_id: { in: requestedIds } },
          include: { return: { select: { status: true } } },
        });
        const earnedWeights = order.items.map((item) =>
          moneyToMinorUnits(item.net_line_total),
        );
        const earnedTotal = order.loyalty_ledger
          .filter((entry) => entry.type === 'earn')
          .reduce((sum, entry) => sum + entry.points, 0);
        const earnedByLine = this.allocateIntegers(earnedTotal, earnedWeights);
        const redeemedByLine = this.allocateIntegers(
          order.loyalty_points_redeemed,
          order.items.map((item) =>
            moneyToMinorUnits(item.loyalty_discount_share),
          ),
        );
        const byId = new Map(
          order.items.map((item, index) => [item.id, { item, index }]),
        );
        let expected = 0n;
        const lines = input.items.map((entry) => {
          const found = byId.get(entry.order_item_id);
          if (!found)
            throw invalid(
              'RETURN_ITEM_NOT_ON_ORDER',
              'Item is not on this order',
            );
          const { item, index } = found;
          const requested = new Prisma.Decimal(entry.quantity);
          this.requireQuantity(requested, item.whole_units_only);
          const prior = previous.filter(
            (row) =>
              row.order_item_id === item.id && row.return.status !== 'rejected',
          );
          const reserved = prior.reduce(
            (sum, row) =>
              sum.plus(
                row.return.status === 'requested'
                  ? row.quantity
                  : row.approved_quantity,
              ),
            new Prisma.Decimal(0),
          );
          const delivered = item.custody_holdings.reduce(
            (sum, holding) => sum.plus(holding.quantity),
            new Prisma.Decimal(0),
          );
          const refused = item.custody_exception_lines.reduce(
            (sum, line) => sum.plus(line.quantity),
            new Prisma.Decimal(0),
          );
          const deliveredQuantity = (
            delivered.gt(0) ? delivered : item.quantity
          ).minus(refused);
          if (requested.gt(deliveredQuantity.minus(reserved))) {
            throw invalid(
              'RETURN_QUANTITY_EXCEEDS_ELIGIBLE',
              'Return quantity exceeds delivered quantity less prior returns and refusals',
            );
          }
          const net = this.segmentMoney(
            this.netPaid(item),
            item.quantity,
            reserved,
            requested,
            item.whole_units_only,
          );
          const earned = this.segmentInteger(
            earnedByLine[index] ?? 0,
            item.quantity,
            reserved,
            requested,
            item.whole_units_only,
          );
          const redeemed = this.segmentInteger(
            redeemedByLine[index] ?? 0,
            item.quantity,
            reserved,
            requested,
            item.whole_units_only,
          );
          expected += moneyToMinorUnits(net);
          return {
            order_item_id: item.id,
            quantity: requested,
            allocation_start_quantity: reserved,
            customer_reason: entry.reason.trim(),
            reason_code: entry.reason_code ?? 'other',
            unit_price: item.unit_price,
            discount_share: new Prisma.Decimal(item.unit_price)
              .times(requested)
              .minus(net),
            net_amount: net,
            earned_points_share: earned,
            redeemed_points_share: redeemed,
            base_unit: item.base_unit,
            whole_units_only: item.whole_units_only,
          };
        });
        const id = randomUUID();
        const number = await this.numbers.issue(
          tx,
          'customer_return',
          'CRN',
          today,
        );
        await tx.return.create({
          data: {
            id,
            document_number: number,
            order_id: order.id,
            user_id: customerId,
            created_by: actor.id,
            source,
            reason: input.reason?.trim() || null,
            status: 'requested',
            document_date: today,
            accounting_date: today,
            expected_refund: minorUnitsToMoney(expected),
            items: { create: lines },
            events: {
              create: {
                type: 'requested',
                operation_id: operationId,
                document_date: today,
                accounting_date: today,
                actor_id: actor.id,
              },
            },
          },
        });
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'return.request',
          entityType: 'return',
          entityId: id,
          after: {
            source,
            order_id: order.id,
            expected_refund: minorUnitsToMoney(expected),
          },
        });
        await this.notifications?.record(
          tx,
          customerId,
          'return_update',
          'return',
          id,
          'requested',
        );
        return { id };
      },
    });
    return this.get(result.id, { user_id: customerId });
  }

  async approve(actor: Actor, id: string, input: ApproveReturnDto) {
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions: actor.permissions,
    });
    const result = await this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint: `POST /returns/${id}/approve`,
      payload: input,
      responseStatus: 200,
      work: async (tx) => {
        const current = await this.lockReturn(tx, id);
        if (current.status !== 'requested') {
          throw conflict(
            'RETURN_INVALID_STATE',
            'Only a requested return can be approved or rejected',
          );
        }
        assertDifferentActor(
          actor.id,
          current.created_by,
          'The return creator cannot approve it',
        );
        const decisions = new Map(
          (input.items ?? []).map((line) => [line.return_item_id, line]),
        );
        if (input.decision === 'reject') {
          if (decisions.size)
            throw invalid(
              'RETURN_REJECTION_HAS_LINES',
              'A whole rejection must not include line quantities',
            );
          if (!input.note?.trim())
            throw invalid(
              'RETURN_REJECTION_REASON_REQUIRED',
              'A rejection reason is required',
            );
          await tx.return.update({
            where: { id },
            data: {
              status: 'rejected',
              reviewed_by: actor.id,
              reviewed_at: new Date(),
            },
          });
          await this.addEvent(
            tx,
            current.id,
            'rejected',
            input.operation_id,
            dates,
            actor.id,
            input.note,
          );
          await this.auditTransition(
            tx,
            actor.id,
            current.id,
            current.status,
            'rejected',
          );
          await this.notifications?.record(
            tx,
            current.user_id,
            'return_update',
            'return',
            id,
            'rejected',
          );
          return { id };
        }
        if (
          decisions.size !== current.items.length ||
          current.items.some((line) => !decisions.has(line.id))
        ) {
          throw invalid(
            'RETURN_APPROVAL_INCOMPLETE',
            'Review every requested line exactly once',
          );
        }
        let approvedCount = 0;
        let fullyApprovedCount = 0;
        let approvedRefund = 0n;
        for (const line of current.items) {
          const quantity = new Prisma.Decimal(
            decisions.get(line.id)!.approved_quantity,
          );
          this.requireQuantity(quantity, line.whole_units_only, true);
          if (quantity.gt(line.quantity)) {
            throw invalid(
              'RETURN_APPROVAL_EXCEEDS_REQUEST',
              'Approved quantity exceeds requested quantity',
            );
          }
          const refund = this.segmentMoney(
            this.netPaid(line.order_item),
            line.order_item.quantity,
            line.allocation_start_quantity,
            quantity,
            line.whole_units_only,
          );
          await tx.returnItem.update({
            where: { id: line.id },
            data: { approved_quantity: quantity, approved_refund: refund },
          });
          if (quantity.gt(0)) approvedCount += 1;
          if (quantity.equals(line.quantity)) fullyApprovedCount += 1;
          approvedRefund += moneyToMinorUnits(refund);
        }
        if (!approvedCount) {
          throw invalid(
            'RETURN_APPROVAL_EMPTY',
            'At least one line must be approved; reject the return otherwise',
          );
        }
        const defaultFee = await this.defaultDeliveryFeeRefund(
          tx,
          current.id,
          current.order,
        );
        const requestedFee =
          input.delivery_fee_refund === undefined
            ? defaultFee
            : new Prisma.Decimal(input.delivery_fee_refund);
        if (!requestedFee.equals(defaultFee)) {
          if (!actor.permissions.includes('returns.refund_delivery_fee')) {
            throw forbidden(
              'RETURN_DELIVERY_FEE_PERMISSION_REQUIRED',
              'A delivery-fee exception requires returns.refund_delivery_fee',
            );
          }
          if (!input.delivery_fee_refund_reason?.trim()) {
            throw invalid(
              'RETURN_DELIVERY_FEE_REASON_REQUIRED',
              'A delivery-fee exception reason is required',
            );
          }
        }
        const priorFee = await tx.return.aggregate({
          where: {
            order_id: current.order_id,
            id: { not: current.id },
            status: { not: 'rejected' },
          },
          _sum: { delivery_fee_refund: true },
        });
        if (
          requestedFee
            .plus(priorFee._sum.delivery_fee_refund ?? 0)
            .gt(current.order.delivery_fee)
        ) {
          throw conflict(
            'RETURN_DELIVERY_FEE_EXCEEDS_CHARGED',
            'Delivery-fee refunds cannot exceed the fee charged',
          );
        }
        const status =
          fullyApprovedCount === current.items.length
            ? 'approved'
            : 'partially_approved';
        await tx.return.update({
          where: { id },
          data: {
            status,
            expected_refund: new Prisma.Decimal(
              minorUnitsToMoney(approvedRefund),
            ).plus(requestedFee),
            delivery_fee_refund: requestedFee,
            reviewed_by: actor.id,
            reviewed_at: new Date(),
          },
        });
        await this.addEvent(
          tx,
          id,
          status,
          input.operation_id,
          dates,
          actor.id,
          input.delivery_fee_refund_reason ?? input.note,
        );
        await this.auditTransition(tx, actor.id, id, current.status, status, {
          goods_refund: minorUnitsToMoney(approvedRefund),
          delivery_fee_refund: requestedFee,
        });
        await this.notifications?.record(
          tx,
          current.user_id,
          'return_update',
          'return',
          id,
          status,
        );
        return { id };
      },
    });
    return this.get(result.id);
  }

  async receive(actor: Actor, id: string, input: ReceiveReturnDto) {
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions: actor.permissions,
    });
    const result = await this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint: `POST /returns/${id}/receive`,
      payload: input,
      responseStatus: 200,
      work: async (tx) => {
        const row = await this.lockReturn(tx, id);
        if (!['approved', 'partially_approved'].includes(row.status)) {
          throw conflict(
            'RETURN_INVALID_STATE',
            'Only an approved return can be received',
          );
        }
        await this.assertTransitionActor(tx, row, actor.id);
        await tx.return.update({ where: { id }, data: { status: 'received' } });
        await this.addEvent(
          tx,
          id,
          'received',
          input.operation_id,
          dates,
          actor.id,
          input.note,
        );
        await this.auditTransition(tx, actor.id, id, row.status, 'received');
        return { id };
      },
    });
    return this.get(result.id);
  }

  async inspect(actor: Actor, id: string, input: InspectReturnDto) {
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions: actor.permissions,
    });
    const result = await this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint: `POST /returns/${id}/inspect`,
      payload: input,
      responseStatus: 200,
      work: async (tx) => {
        const row = await this.lockReturn(tx, id);
        if (row.status !== 'received') {
          throw conflict(
            'RETURN_INVALID_STATE',
            'Only a received return can be inspected',
          );
        }
        await this.assertTransitionActor(tx, row, actor.id);
        const decisions = new Map(
          input.items.map((line) => [line.return_item_id, line]),
        );
        const approved = row.items.filter((line) =>
          line.approved_quantity.gt(0),
        );
        if (
          decisions.size !== approved.length ||
          approved.some((line) => !decisions.has(line.id))
        ) {
          throw invalid(
            'RETURN_INSPECTION_INCOMPLETE',
            'Inspect every approved line exactly once',
          );
        }
        for (const line of approved) {
          const decision = decisions.get(line.id)!;
          const stock = await this.inventory.inspectReturnedStock(tx, {
            returnId: row.id,
            returnItemId: line.id,
            orderItemId: line.order_item_id,
            quantity: line.approved_quantity,
            condition: decision.condition,
            locationId: decision.location_id,
            actorId: actor.id,
            documentDate: dates.documentDate,
            accountingDate: dates.accountingDate,
          });
          await tx.returnItem.update({
            where: { id: line.id },
            data: {
              condition: decision.condition,
              restock: decision.condition === 'sellable',
              batch_id: stock.batchId,
              inspection_location_id: decision.location_id,
              issue_cost_value: stock.issueCostValue,
            },
          });
          if (stock.restockJournalId) {
            await tx.returnPosting.create({
              data: {
                return_id: row.id,
                role: `restock_issue_cost:${line.id}`,
                journal_entry_id: stock.restockJournalId,
              },
            });
          }
          if (stock.writeDownJournalId) {
            await tx.returnPosting.create({
              data: {
                return_id: row.id,
                role: `write_down:${line.id}`,
                journal_entry_id: stock.writeDownJournalId,
              },
            });
          }
          await this.audit.record(tx, {
            actorId: actor.id,
            action: 'return.inspect_line',
            entityType: 'return_item',
            entityId: line.id,
            after: {
              condition: decision.condition,
              location_id: decision.location_id,
              quantity: line.approved_quantity,
              issue_cost_value: stock.issueCostValue,
            },
          });
        }
        const goodsRefund = approved.reduce(
          (sum, line) => sum.plus(line.approved_refund),
          new Prisma.Decimal(0),
        );
        const collection = await tx.deliveryCollection.findUnique({
          where: { order_id: row.order_id },
          include: {
            custody_exceptions: { where: { reversal: { is: null } } },
          },
        });
        const priorOffsets = await tx.return.aggregate({
          where: {
            order_id: row.order_id,
            id: { not: row.id },
            status: { in: ['inspected', 'refunded', 'completed'] },
          },
          _sum: { uncollected_offset: true },
        });
        const exceptionOffsets =
          collection?.custody_exceptions.reduce(
            (sum, item) => sum.plus(item.exception_offset_iqd),
            new Prisma.Decimal(0),
          ) ?? new Prisma.Decimal(0);
        const openShortfall = Prisma.Decimal.max(
          0,
          (collection?.shortfall_amount ?? new Prisma.Decimal(0))
            .minus(exceptionOffsets)
            .minus(priorOffsets._sum.uncollected_offset ?? 0),
        );
        const offset = Prisma.Decimal.min(goodsRefund, openShortfall);
        const payable = goodsRefund.minus(offset).plus(row.delivery_fee_refund);
        if (goodsRefund.gt(0)) {
          const entry = await this.ledger.post(tx, {
            sourceType: 'return',
            sourceId: row.id,
            event: 'return_against_uncollected',
            documentDate: dates.documentDate,
            accountingDate: dates.accountingDate,
            createdBy: actor.id,
            description: `Return ${row.document_number}`,
            lines: this.exceptionPosting('return_against_uncollected', {
              resolved: '0',
              returnAmount: goodsRefund.toString(),
              exceptionOffset: offset.toString(),
              refundPayable: goodsRefund.minus(offset).toString(),
              deliveryFee: '0',
            }),
          });
          await tx.returnPosting.create({
            data: {
              return_id: row.id,
              role: 'return_against_uncollected',
              journal_entry_id: entry.id,
            },
          });
        }
        if (row.delivery_fee_refund.gt(0)) {
          const entry = await this.ledger.post(tx, {
            sourceType: 'return',
            sourceId: row.id,
            event: 'delivery_fee_refund',
            documentDate: dates.documentDate,
            accountingDate: dates.accountingDate,
            createdBy: actor.id,
            description: `Delivery fee refund for ${row.document_number}`,
            lines: this.exceptionPosting('delivery_fee_refund', {
              resolved: '0',
              returnAmount: '0',
              exceptionOffset: '0',
              refundPayable: '0',
              deliveryFee: row.delivery_fee_refund.toString(),
            }),
          });
          await tx.returnPosting.create({
            data: {
              return_id: row.id,
              role: 'delivery_fee_refund',
              journal_entry_id: entry.id,
            },
          });
        }
        if (payable.gt(0)) {
          await tx.refundLedgerEntry.create({
            data: {
              order_id: row.order_id,
              return_id: row.id,
              amount: payable,
              status: 'obligation',
              reason: `Return ${row.document_number}; ${offset.toString()} applied against uncollected cash`,
              created_by: actor.id,
            },
          });
        }
        await tx.return.update({
          where: { id: row.id },
          data: {
            status: 'inspected',
            refund_amount: goodsRefund.plus(row.delivery_fee_refund),
            uncollected_offset: offset,
            cash_refund_amount: payable,
          },
        });
        await this.addEvent(
          tx,
          id,
          'inspected',
          input.operation_id,
          dates,
          actor.id,
          input.note,
        );
        await this.auditTransition(tx, actor.id, id, row.status, 'inspected', {
          goods_refund: goodsRefund,
          delivery_fee_refund: row.delivery_fee_refund,
          uncollected_offset: offset,
          cash_refund_amount: payable,
        });
        return { id };
      },
    });
    return this.get(result.id);
  }

  async refund(actor: Actor, id: string, input: RefundReturnDto) {
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions: actor.permissions,
    });
    const result = await this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint: `POST /returns/${id}/refund`,
      payload: input,
      responseStatus: 200,
      work: async (tx) => {
        const row = await this.lockReturn(tx, id);
        if (row.status !== 'inspected') {
          throw conflict(
            'RETURN_INVALID_STATE',
            'Only an inspected return can be refunded',
          );
        }
        await this.assertTransitionActor(tx, row, actor.id);
        const amount = row.cash_refund_amount;
        const collection = await tx.deliveryCollection.findUnique({
          where: { order_id: row.order_id },
          select: { collected_amount: true },
        });
        const paidPayments = await tx.payment.aggregate({
          where: { order_id: row.order_id, status: 'paid' },
          _sum: { amount: true },
        });
        const priorRefunds = await tx.return.aggregate({
          where: {
            order_id: row.order_id,
            id: { not: row.id },
            status: { in: ['refunded', 'completed'] },
          },
          _sum: { cash_refund_amount: true },
        });
        // A confirmed COD payment represents the whole order, while the
        // collection records what the customer actually handed over. Prefer
        // the collection when one exists so a shortfall can never be refunded.
        const actuallyPaid =
          collection?.collected_amount ??
          paidPayments._sum.amount ??
          new Prisma.Decimal(0);
        const refundablePaid = Prisma.Decimal.max(
          0,
          actuallyPaid.minus(priorRefunds._sum.cash_refund_amount ?? 0),
        );
        if (amount.gt(refundablePaid)) {
          throw conflict(
            'RETURN_REFUND_EXCEEDS_PAID',
            'The return refund cannot exceed the amount the customer actually paid',
          );
        }
        let paymentId: string | null = null;
        if (amount.gt(0)) {
          let creditAccount: string;
          let cashAccountId: string | null = null;
          let collectionId: string | null = null;
          if (input.method === 'cash_account') {
            if (!input.cash_account_id || input.collection_id) {
              throw invalid(
                'RETURN_REFUND_METHOD_FIELDS_INVALID',
                'Cash refunds require only cash_account_id',
              );
            }
            const cash = await tx.cashAccount.findUnique({
              where: { id: input.cash_account_id },
              include: { ledger_account: true },
            });
            if (!cash || !cash.is_active || cash.currency_code !== 'IQD') {
              throw conflict(
                'RETURN_CASH_ACCOUNT_UNAVAILABLE',
                'An active IQD cash account is required',
              );
            }
            creditAccount = cash.ledger_account.code;
            cashAccountId = cash.id;
          } else {
            if (
              !input.collection_id ||
              input.cash_account_id ||
              !input.proof_reference?.trim()
            ) {
              throw invalid(
                'RETURN_CUSTODY_REFUND_PROOF_REQUIRED',
                'A delivery-custody refund requires collection_id and proof_reference',
              );
            }
            const collection = await tx.deliveryCollection.findFirst({
              where: { id: input.collection_id, order_id: row.order_id },
              include: {
                cash_receipt_allocations: true,
                trip_settlement_allocations: true,
                return_refund_payments: true,
              },
            });
            if (!collection || !collection.collected_amount) {
              throw conflict(
                'RETURN_COLLECTION_UNAVAILABLE',
                'The delivery collection is unavailable',
              );
            }
            const held = collection.collected_amount
              .minus(
                collection.cash_receipt_allocations.reduce(
                  (sum, item) => sum.plus(item.amount_iqd),
                  new Prisma.Decimal(0),
                ),
              )
              .minus(
                collection.trip_settlement_allocations.reduce(
                  (sum, item) => sum.plus(item.amount_iqd),
                  new Prisma.Decimal(0),
                ),
              )
              .minus(
                collection.return_refund_payments.reduce(
                  (sum, item) => sum.plus(item.amount_iqd),
                  new Prisma.Decimal(0),
                ),
              );
            if (amount.gt(held)) {
              throw conflict(
                'RETURN_REFUND_EXCEEDS_CUSTODY',
                'The delivery party does not hold enough collection cash',
              );
            }
            creditAccount = '1020';
            collectionId = collection.id;
          }
          const entry = await this.ledger.post(tx, {
            sourceType: 'return',
            sourceId: row.id,
            event: 'refund_payment',
            documentDate: dates.documentDate,
            accountingDate: dates.accountingDate,
            createdBy: actor.id,
            description: `Refund payment for ${row.document_number}`,
            lines: this.simplePosting('2030', creditAccount, amount),
          });
          const payment = await tx.returnRefundPayment.create({
            data: {
              return_id: row.id,
              operation_id: input.operation_id,
              method: input.method,
              amount_iqd: amount,
              cash_account_id: cashAccountId,
              collection_id: collectionId,
              proof_reference: input.proof_reference?.trim() || null,
              document_date: dates.documentDate,
              accounting_date: dates.accountingDate,
              created_by: actor.id,
              journal_entry_id: entry.id,
            },
          });
          paymentId = payment.id;
          await tx.returnPosting.create({
            data: {
              return_id: row.id,
              role: 'refund_payment',
              journal_entry_id: entry.id,
            },
          });
        }
        const account = await tx.loyaltyAccount.upsert({
          where: { user_id: row.user_id },
          update: {},
          create: { user_id: row.user_id },
        });
        await tx.$queryRaw`SELECT id FROM loyalty_accounts WHERE id = ${account.id}::uuid FOR UPDATE`;
        const earned = row.items.reduce(
          (sum, item) =>
            sum +
            this.segmentInteger(
              item.earned_points_share,
              item.quantity,
              new Prisma.Decimal(0),
              item.approved_quantity,
              item.whole_units_only,
            ),
          0,
        );
        const redeemed = row.items.reduce(
          (sum, item) =>
            sum +
            this.segmentInteger(
              item.redeemed_points_share,
              item.quantity,
              new Prisma.Decimal(0),
              item.approved_quantity,
              item.whole_units_only,
            ),
          0,
        );
        if (earned > 0) {
          await tx.loyaltyLedger.create({
            data: {
              account_id: account.id,
              order_id: row.order_id,
              return_id: row.id,
              type: 'return_reversal',
              reason: 'returned_units_earned_points_reversed',
              points: -earned,
              created_by: actor.id,
              note: 'A negative balance is recovered from future rewards; no cash is deducted',
            },
          });
        }
        if (redeemed > 0) {
          await tx.loyaltyLedger.create({
            data: {
              account_id: account.id,
              order_id: row.order_id,
              return_id: row.id,
              type: 'return_restore',
              reason: 'returned_units_redeemed_points_restored',
              points: redeemed,
              created_by: actor.id,
            },
          });
        }
        await tx.return.update({
          where: { id: row.id },
          data: {
            status: 'refunded',
            points_earned_reversed: earned,
            points_redeemed_restored: redeemed,
            completed_at: new Date(),
          },
        });
        await this.addEvent(
          tx,
          id,
          'refunded',
          input.operation_id,
          dates,
          actor.id,
          input.proof_reference,
        );
        await this.markOrderReturnedIfComplete(tx, row.order_id, row.id);
        await this.auditTransition(tx, actor.id, id, row.status, 'refunded', {
          payment_id: paymentId,
          amount,
          points_earned_reversed: earned,
          points_redeemed_restored: redeemed,
        });
        await this.notifications?.record(
          tx,
          row.user_id,
          'return_update',
          'return',
          id,
          'refunded',
        );
        return { id };
      },
    });
    return this.get(result.id);
  }

  private async get(id: string, scope: Prisma.ReturnWhereInput = {}) {
    const row = await this.prisma.return.findFirst({
      where: { id, ...scope },
      include: returnInclude,
    });
    if (!row) throw notFound('RETURN_NOT_FOUND', 'Return not found');
    return this.present(row);
  }

  private async lockReturn(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM returns WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await tx.return.findUnique({
      where: { id },
      include: {
        items: { include: { order_item: true } },
        events: { orderBy: [{ created_at: 'asc' }, { id: 'asc' }] },
        order: { include: { items: true } },
      },
    });
    if (!row) throw notFound('RETURN_NOT_FOUND', 'Return not found');
    // All financial and quantity caps are per order, so transitions on two
    // returns for the same order must not race each other.
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${row.order_id}::uuid FOR UPDATE`;
    return row;
  }

  private async defaultDeliveryFeeRefund(
    tx: Tx,
    returnId: string,
    order: {
      id: string;
      delivery_fee: Prisma.Decimal;
      items: Array<{ id: string; quantity: Prisma.Decimal }>;
    },
  ) {
    const all = await tx.returnItem.findMany({
      where: {
        return: { order_id: order.id, status: { not: 'rejected' } },
        OR: [
          { return_id: { not: returnId }, approved_quantity: { gt: 0 } },
          { return_id: returnId },
        ],
      },
      select: {
        order_item_id: true,
        quantity: true,
        approved_quantity: true,
        reason_code: true,
        return_id: true,
      },
    });
    const totals = new Map<string, Prisma.Decimal>();
    let eligibleCause = true;
    for (const item of all) {
      const quantity = item.approved_quantity;
      if (!quantity.gt(0)) continue;
      totals.set(
        item.order_item_id,
        (totals.get(item.order_item_id) ?? new Prisma.Decimal(0)).plus(
          quantity,
        ),
      );
      if (!['defect', 'store_error', 'wrong_item'].includes(item.reason_code))
        eligibleCause = false;
    }
    const full = order.items.every((item) =>
      (totals.get(item.id) ?? new Prisma.Decimal(0)).gte(item.quantity),
    );
    return full && eligibleCause ? order.delivery_fee : new Prisma.Decimal(0);
  }

  private async assertTransitionActor(
    tx: Tx,
    row: { created_by: string; events: Array<{ actor_id: string }> },
    actorId: string,
  ) {
    if ((await separationOfDutiesLevel(tx)) !== 'strict') return;
    const prior = row.events[row.events.length - 1]?.actor_id ?? row.created_by;
    assertDifferentActor(
      actorId,
      prior,
      'Strict separation of duties requires another user for this transition',
    );
  }

  private addEvent(
    tx: Tx,
    returnId: string,
    type: string,
    operationId: string,
    dates: { documentDate: Date; accountingDate: Date },
    actorId: string,
    note?: string,
  ) {
    return tx.returnEvent.create({
      data: {
        return_id: returnId,
        type,
        operation_id: operationId,
        document_date: dates.documentDate,
        accounting_date: dates.accountingDate,
        actor_id: actorId,
        note: note?.trim() || null,
      },
    });
  }

  private auditTransition(
    tx: Tx,
    actorId: string,
    id: string,
    before: string,
    after: string,
    details: Record<string, unknown> = {},
  ) {
    return this.audit.record(tx, {
      actorId,
      action: `return.${after}`,
      entityType: 'return',
      entityId: id,
      before: { status: before },
      after: { status: after, ...details },
    });
  }

  private async markOrderReturnedIfComplete(
    tx: Tx,
    orderId: string,
    returnId: string,
  ) {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        items: {
          include: {
            custody_holdings: { where: { status: 'sold' } },
            custody_exception_lines: {
              where: {
                exception: {
                  type: 'return_against_uncollected',
                  reversal: { is: null },
                },
              },
            },
          },
        },
      },
    });
    const returned = await tx.returnItem.groupBy({
      by: ['order_item_id'],
      where: {
        return: {
          order_id: orderId,
          status: { in: ['refunded', 'completed'] },
        },
      },
      _sum: { approved_quantity: true },
    });
    const totals = new Map(
      returned.map((item) => [
        item.order_item_id,
        item._sum.approved_quantity ?? new Prisma.Decimal(0),
      ]),
    );
    if (
      !order.items.every((item) => {
        const issued = item.custody_holdings.reduce(
          (sum, holding) => sum.plus(holding.quantity),
          new Prisma.Decimal(0),
        );
        const refused = item.custody_exception_lines.reduce(
          (sum, line) => sum.plus(line.quantity),
          new Prisma.Decimal(0),
        );
        const delivered = (issued.gt(0) ? issued : item.quantity).minus(
          refused,
        );
        return (totals.get(item.id) ?? new Prisma.Decimal(0)).gte(delivered);
      })
    )
      return;
    if (order.status !== 'returned') {
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'returned' },
      });
      await tx.orderStatusEvent.create({
        data: {
          order_id: orderId,
          status: 'returned',
          note: `All delivered quantities returned; return ${returnId}`,
        },
      });
      await tx.delivery.updateMany({
        where: { order_id: orderId, status: 'delivered' },
        data: { status: 'returned' },
      });
    }
  }

  private netPaid(item: { net_paid_total: Prisma.Decimal }) {
    return item.net_paid_total;
  }

  private requireQuantity(
    quantity: Prisma.Decimal,
    whole: boolean,
    allowZero = false,
  ) {
    if (allowZero ? quantity.lt(0) : !quantity.gt(0)) {
      throw invalid(
        'RETURN_QUANTITY_INVALID',
        allowZero
          ? 'Quantity must be non-negative'
          : 'Quantity must be positive',
      );
    }
    if (quantity.decimalPlaces() > 3)
      throw invalid(
        'RETURN_QUANTITY_PRECISION',
        'Quantity supports at most three decimal places',
      );
    if (whole && !quantity.isInteger())
      throw invalid(
        'SKU_WHOLE_UNITS_ONLY',
        'This SKU accepts whole-unit quantities only',
      );
  }

  private quanta(value: Prisma.Decimal, whole: boolean) {
    return BigInt(value.times(whole ? 1 : 1000).toFixed(0));
  }

  private segmentMoney(
    totalAmount: Prisma.Decimal,
    totalQuantity: Prisma.Decimal,
    startQuantity: Prisma.Decimal,
    quantity: Prisma.Decimal,
    whole: boolean,
  ) {
    return minorUnitsToMoney(
      this.segmentBigInt(
        moneyToMinorUnits(totalAmount),
        this.quanta(totalQuantity, whole),
        this.quanta(startQuantity, whole),
        this.quanta(quantity, whole),
      ),
    );
  }

  private segmentInteger(
    total: number,
    totalQuantity: Prisma.Decimal,
    startQuantity: Prisma.Decimal,
    quantity: Prisma.Decimal,
    whole: boolean,
  ) {
    return Number(
      this.segmentBigInt(
        BigInt(total),
        this.quanta(totalQuantity, whole),
        this.quanta(startQuantity, whole),
        this.quanta(quantity, whole),
      ),
    );
  }

  private segmentBigInt(
    total: bigint,
    units: bigint,
    start: bigint,
    count: bigint,
  ) {
    if (total <= 0n || units <= 0n || count <= 0n) return 0n;
    const base = total / units;
    const remainder = total % units;
    const remainderInRange = this.bigMax(
      0n,
      this.bigMin(start + count, remainder) - start,
    );
    return base * count + remainderInRange;
  }

  private allocateIntegers(total: number, weights: bigint[]) {
    const sum = weights.reduce((value, weight) => value + weight, 0n);
    if (total <= 0 || sum <= 0n) return weights.map(() => 0);
    const target = BigInt(total);
    const rows = weights.map((weight, index) => ({
      index,
      value: (target * weight) / sum,
      remainder: (target * weight) % sum,
    }));
    let left = target - rows.reduce((value, row) => value + row.value, 0n);
    for (const row of [...rows].sort((a, b) =>
      a.remainder === b.remainder
        ? a.index - b.index
        : a.remainder > b.remainder
          ? -1
          : 1,
    )) {
      if (left === 0n) break;
      row.value += 1n;
      left -= 1n;
    }
    return rows
      .sort((a, b) => a.index - b.index)
      .map((row) => Number(row.value));
  }

  private bigMin(left: bigint, right: bigint) {
    return left < right ? left : right;
  }

  private bigMax(left: bigint, right: bigint) {
    return left > right ? left : right;
  }

  private simplePosting(debit: string, credit: string, amount: Prisma.Decimal) {
    return [
      {
        accountCode: debit,
        side: 'debit' as const,
        baseAmount: amount.toString(),
        currencyCode: 'IQD',
        originalAmount: amount.toString(),
        exchangeRate: '1',
      },
      {
        accountCode: credit,
        side: 'credit' as const,
        baseAmount: amount.toString(),
        currencyCode: 'IQD',
        originalAmount: amount.toString(),
        exchangeRate: '1',
      },
    ];
  }

  private exceptionPosting(
    scenario: 'return_against_uncollected' | 'delivery_fee_refund',
    amounts: {
      resolved: string;
      returnAmount: string;
      exceptionOffset: string;
      refundPayable: string;
      deliveryFee: string;
    },
  ) {
    return materializeCustodyExceptionPosting(scenario, amounts).map(
      (line) => ({
        accountCode: line.accountCode,
        side: line.side,
        baseAmount: line.amount,
        currencyCode: 'IQD',
        originalAmount: line.amount,
        exchangeRate: '1',
      }),
    );
  }

  private present(row: ReturnRow) {
    return {
      id: row.id,
      document_number: row.document_number,
      order_id: row.order_id,
      order_number: row.order.order_number,
      user_id: row.user_id,
      source: row.source,
      created_by: row.created_by,
      type: row.type,
      status: row.status,
      reason: row.reason,
      expected_refund: Number(row.expected_refund),
      refund_amount: Number(row.refund_amount),
      delivery_fee_refund: Number(row.delivery_fee_refund),
      uncollected_offset: Number(row.uncollected_offset),
      cash_refund_amount: Number(row.cash_refund_amount),
      points_effect: {
        earned_reversed: row.points_earned_reversed,
        redeemed_restored: row.points_redeemed_restored,
        net: row.points_redeemed_restored - row.points_earned_reversed,
      },
      currency: row.currency_code,
      document_date: businessDateText(row.document_date),
      accounting_date: businessDateText(row.accounting_date),
      reviewed_by: row.reviewed_by,
      reviewed_at: row.reviewed_at,
      completed_at: row.completed_at,
      created_at: row.created_at,
      items: row.items.map((item) => ({
        id: item.id,
        order_item_id: item.order_item_id,
        variant_id: item.order_item.variant_id,
        product_name_ar: item.order_item.product_name_ar,
        product_name_en: item.order_item.product_name_en,
        quantity: Number(item.quantity),
        approved_quantity: Number(item.approved_quantity),
        customer_reason: item.customer_reason,
        reason_code: item.reason_code,
        unit_price: Number(item.unit_price),
        discount_share: Number(item.discount_share),
        net_amount: Number(item.net_amount),
        approved_refund: Number(item.approved_refund),
        earned_points_share: item.earned_points_share,
        redeemed_points_share: item.redeemed_points_share,
        base_unit: item.base_unit,
        whole_units_only: item.whole_units_only,
        currency: item.currency_code,
        condition: item.condition,
        restock: item.restock,
        batch_id: item.batch_id,
        inspection_location: item.inspection_location,
      })),
      refund: row.refund
        ? {
            id: row.refund.id,
            order_id: row.refund.order_id,
            return_id: row.refund.return_id,
            amount: Number(row.refund.amount),
            currency: row.refund.currency_code,
            status: row.refund.status,
            reason: row.refund.reason,
            created_by: row.refund.created_by,
            created_at: row.refund.created_at,
          }
        : null,
      events: row.events.map((event) => ({
        id: event.id,
        type: event.type,
        operation_id: event.operation_id,
        document_date: businessDateText(event.document_date),
        accounting_date: businessDateText(event.accounting_date),
        actor_id: event.actor_id,
        note: event.note,
        created_at: event.created_at,
      })),
      refund_payments: row.refund_payments.map((payment) => ({
        id: payment.id,
        method: payment.method,
        amount_iqd: Number(payment.amount_iqd),
        cash_account: payment.cash_account,
        collection: payment.collection,
        proof_reference: payment.proof_reference,
        document_date: businessDateText(payment.document_date),
        accounting_date: businessDateText(payment.accounting_date),
        created_by: payment.created_by,
        created_at: payment.created_at,
      })),
      postings: row.postings.map((posting) => ({
        role: posting.role.split(':', 1)[0],
        journal_entry_id: posting.journal_entry_id,
        journal_document_number: posting.journal_entry.document_number,
      })),
    };
  }
}
