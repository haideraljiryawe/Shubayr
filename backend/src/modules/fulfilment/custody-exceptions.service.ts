import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { conflict, invalid } from '../../common/http/api-error';
import { actorDisplayName, actorSelect } from '../../common/users/actor-name';
import {
  assertDifferentActor,
  separationOfDutiesLevel,
} from '../../common/access/separation-of-duties';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { businessDateText, parseBusinessDate } from '../finance/business-date';
import { DateRulesService } from '../finance/date-rules.service';
import { DocumentNumberService } from '../finance/document-number.service';
import { LedgerService, PostingLine } from '../finance/ledger.service';
import { OperationService } from '../finance/operation.service';
import {
  CustodyExceptionPostingAmounts,
  CustodyExceptionPostingScenario,
  materializeCustodyExceptionPosting,
} from '../finance/posting-scenarios';
import {
  CreateDeliveryFeeRefundDto,
  CreateGoodsCustodyExceptionDto,
  CreateReturnAgainstUncollectedDto,
  CustodyExceptionQueryDto,
  ReturnAtDoorDto,
  ReverseCustodyExceptionDto,
} from './dto/custody-exception.dto';
import { custodyExceptionBusinessDate } from './custody-exception-date';
import { DeliveriesService } from './deliveries.service';
import { ExternalDriverTripHistoryService } from './external-driver-trip-history.service';

type Actor = { id: string; permissions: readonly string[] };
type Tx = Prisma.TransactionClient;

const exceptionInclude = {
  creator: { select: actorSelect },
  party: {
    select: {
      id: true,
      kind: true,
      user_id: true,
      name: true,
      phone: true,
    },
  },
  order: { select: { id: true, order_number: true, status: true } },
  collection: {
    select: {
      id: true,
      status: true,
      due_amount: true,
      collected_amount: true,
      shortfall_amount: true,
    },
  },
  cash_account: {
    select: { id: true, name: true, kind: true, currency_code: true },
  },
  lines: {
    include: {
      order_item: {
        select: { id: true, product_name_ar: true, product_name_en: true },
      },
      batch: { select: { id: true, lot_number: true, variant_id: true } },
      location: {
        select: { id: true, code: true, warehouse_id: true },
      },
    },
    orderBy: { id: 'asc' as const },
  },
  postings: {
    include: { journal_entry: { select: { id: true, event: true } } },
    orderBy: { role: 'asc' as const },
  },
  reversal: {
    include: {
      creator: { select: actorSelect },
      postings: {
        include: { journal_entry: { select: { id: true, event: true } } },
        orderBy: { role: 'asc' as const },
      },
    },
  },
} satisfies Prisma.CustodyExceptionInclude;

@Injectable()
export class CustodyExceptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dates: DateRulesService,
    private readonly numbers: DocumentNumberService,
    private readonly ledger: LedgerService,
    private readonly operations: OperationService,
    private readonly inventory: InventoryService,
    private readonly deliveries: DeliveriesService,
    private readonly tripHistory: ExternalDriverTripHistoryService,
  ) {}

  async recordGoodsLoss(
    actor: Actor,
    input: CreateGoodsCustodyExceptionDto,
    options: {
      endpoint?: string;
      expectedTripId?: string;
      source?: string;
      eventAt?: Date;
      requireTripInProgress?: boolean;
    } = {},
  ) {
    this.assertUniqueHoldings(input.lines);
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions: actor.permissions,
    });
    return this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint: options.endpoint ?? 'POST /admin/custody-exceptions/goods-loss',
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        await this.lockOrder(tx, input.order_id);
        const order = await tx.order.findUnique({
          where: { id: input.order_id },
          include: {
            delivery: { include: { party: true } },
          },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (!order.delivery?.agent_id || !order.delivery.party) {
          throw conflict(
            'ORDER_HAS_NO_CUSTODY_PARTY',
            'Order has no delivery custody party',
          );
        }
        if (!['dispatched', 'failed', 'cancelled'].includes(order.status)) {
          throw conflict(
            'GOODS_LOSS_STATUS_INVALID',
            'Goods loss requires an order with goods in delivery custody',
          );
        }
        await this.assertActorSeparation(
          tx,
          actor.id,
          order.delivery.party.user_id,
          input.order_id,
        );
        const exceptionId = randomUUID();
        const documentNumber = await this.numbers.issue(
          tx,
          'custody_exception',
          'CEX',
          dates.documentDate,
        );
        const stock = await this.inventory.recordCustodyExceptionLoss(tx, {
          exceptionId,
          orderId: order.id,
          partyId: order.delivery.agent_id,
          actorId: actor.id,
          lines: input.lines,
        });
        if (!stock.total.gt(0)) {
          throw conflict(
            'CUSTODY_COST_UNAVAILABLE',
            'Exception has no original issue cost',
          );
        }
        await tx.custodyException.create({
          data: {
            id: exceptionId,
            document_number: documentNumber,
            operation_id: input.operation_id,
            type: 'goods_loss',
            party_id: order.delivery.agent_id,
            order_id: order.id,
            liability_bearer: input.liability_bearer,
            amount_iqd: stock.total,
            goods_cost_iqd: stock.total,
            reason: input.reason.trim(),
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            backdate_reason: dates.backdateReason ?? null,
            created_by: actor.id,
          },
        });
        await tx.custodyExceptionLine.createMany({
          data: stock.lines.map((line) => ({
            exception_id: exceptionId,
            custody_holding_id: line.custody_holding_id,
            order_item_id: line.order_item_id,
            batch_id: line.batch_id,
            quantity: line.quantity,
            unit_cost_iqd: line.unit_cost_iqd,
          })),
        });
        await this.post(
          tx,
          exceptionId,
          'custody_reclassification',
          'custody_exception_opened',
          dates,
          actor.id,
          `Goods custody exception ${documentNumber}`,
          this.simplePosting('1040', '1010', stock.total),
        );
        const scenario: CustodyExceptionPostingScenario =
          input.liability_bearer === 'party'
            ? 'exception_handover'
            : 'exception_loss';
        await this.post(
          tx,
          exceptionId,
          'liability_resolution',
          scenario,
          dates,
          actor.id,
          `Custody exception liability borne by ${input.liability_bearer}`,
          this.exceptionPosting(scenario, {
            resolved: stock.total.toString(),
          }),
        );
        await this.applyLossLifecycle(
          tx,
          order.id,
          order.status,
          order.delivery.id,
          documentNumber,
        );
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'custody_exception.goods_loss',
          entityType: 'custody_exception',
          entityId: exceptionId,
          after: {
            document_number: documentNumber,
            order_id: order.id,
            party_id: order.delivery.agent_id,
            liability_bearer: input.liability_bearer,
            goods_cost_iqd: stock.total.toString(),
            line_count: stock.lines.length,
          },
          reason: input.reason.trim(),
        });
        await this.tripHistory.recordForOrder(tx, {
          actorId: actor.id,
          operationId: input.operation_id,
          orderId: order.id,
          expectedTripId: options.expectedTripId,
          requireInProgress: options.requireTripInProgress,
          type: 'lost',
          source: options.source ?? 'custody_exception',
          note: input.reason,
          eventAt: options.eventAt ?? new Date(),
        });
        return this.detailTx(tx, exceptionId, this.canViewCost(actor));
      },
    });
  }

  async recordReturn(actor: Actor, input: CreateReturnAgainstUncollectedDto) {
    this.assertUniqueHoldings(input.lines);
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions: actor.permissions,
    });
    return this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint: 'POST /admin/custody-exceptions/return-against-uncollected',
      payload: input,
      responseStatus: 201,
      work: (tx) => this.recordReturnTx(tx, actor, input, dates),
    });
  }

  async recordDoorReturn(
    actor: Actor,
    deliveryId: string,
    input: ReturnAtDoorDto,
    options: {
      endpoint?: string;
      expectedTripId?: string;
      requireTripInProgress?: boolean;
    } = {},
  ) {
    this.assertUniqueHoldings(input.lines);
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions: actor.permissions,
    });
    return this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint:
        options.endpoint ??
        `POST /admin/deliveries/${deliveryId}/return-at-door`,
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        const delivery = await tx.delivery.findUnique({
          where: { id: deliveryId },
          include: { order: true },
        });
        if (!delivery) throw new NotFoundException('Delivery not found');
        if (
          delivery.status !== 'out_for_delivery' ||
          delivery.order.status !== 'dispatched' ||
          delivery.order.delivery_id !== delivery.id
        ) {
          throw conflict(
            'DOOR_RETURN_REQUIRES_OUT_FOR_DELIVERY',
            'Return at the door requires the current order to be out for delivery',
          );
        }
        if (delivery.order.version !== input.order_version) {
          throw conflict(
            'STALE_ORDER_STATE',
            'Order state changed; reload before recording the return',
          );
        }
        const returnAmount = await this.returnRetailValueTx(
          tx,
          delivery.order_id,
          delivery.agent_id,
          input.lines,
        );
        const customerCollected = delivery.order.total.minus(returnAmount);
        if (customerCollected.lt(0)) {
          throw conflict(
            'RETURN_EXCEEDS_ORDER_VALUE',
            'Refused goods value exceeds the order total',
          );
        }
        const eventAt = new Date(input.event_at);
        await this.deliveries.transitionStatus(
          actor.id,
          delivery.id,
          {
            status: 'delivered',
            order_version: input.order_version,
            operation_id: input.operation_id,
            collection_confirmation: 'confirmed',
            collected_amount: customerCollected.toString(),
            source: input.source,
            event_at: input.event_at,
          },
          false,
          false,
          tx,
          eventAt,
          { record: false, expectedTripId: options.expectedTripId },
        );
        return this.recordReturnTx(
          tx,
          actor,
          {
            operation_id: input.operation_id,
            order_id: delivery.order_id,
            reason: input.reason,
            lines: input.lines,
            document_date: input.document_date,
            accounting_date: input.accounting_date,
            backdate_reason: input.backdate_reason,
          },
          dates,
          {
            expectedTripId: options.expectedTripId,
            requireTripInProgress: options.requireTripInProgress,
            source: input.source,
            eventAt,
            skipDeliveryActorSeparation: true,
          },
        );
      },
    });
  }

  private async recordReturnTx(
    tx: Tx,
    actor: Actor,
    input: CreateReturnAgainstUncollectedDto,
    dates: {
      documentDate: Date;
      accountingDate: Date;
      backdateReason?: string | null;
    },
    options: {
      expectedTripId?: string;
      source?: string;
      eventAt?: Date;
      skipDeliveryActorSeparation?: boolean;
      requireTripInProgress?: boolean;
    } = {},
  ) {
    await this.lockOrder(tx, input.order_id);
    const order = await tx.order.findUnique({
      where: { id: input.order_id },
      include: {
        items: true,
        delivery_collection: {
          include: { party: true },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    const collection = order.delivery_collection;
    if (
      !collection ||
      collection.status !== 'confirmed_short' ||
      !collection.shortfall_amount?.gt(0)
    ) {
      throw conflict(
        'RETURN_REQUIRES_CONFIRMED_SHORTFALL',
        'Return against uncollected requires a confirmed collection shortfall',
      );
    }
    await this.assertActorSeparation(
      tx,
      actor.id,
      collection.party.user_id,
      order.id,
      options.skipDeliveryActorSeparation ? undefined : collection.delivered_by,
    );
    const openShortfall = await this.openShortfall(tx, collection);
    if (!openShortfall.gt(0)) {
      throw conflict(
        'RETURN_SHORTFALL_RESOLVED',
        'Order has no uncollected amount available for a return',
      );
    }
    const exceptionId = randomUUID();
    const documentNumber = await this.numbers.issue(
      tx,
      'custody_exception',
      'CEX',
      dates.documentDate,
    );
    const stock = await this.inventory.returnUncollectedGoods(tx, {
      exceptionId,
      orderId: order.id,
      partyId: collection.party_id,
      actorId: actor.id,
      lines: input.lines,
    });
    const itemById = new Map(order.items.map((item) => [item.id, item]));
    let returnAmount = new Prisma.Decimal(0);
    const persistedLines = stock.lines.map((line) => {
      const item = itemById.get(line.order_item_id);
      if (!item) {
        throw conflict('ORDER_ITEM_UNAVAILABLE', 'Order item is unavailable');
      }
      const lineAmount = item.line_total
        .div(item.quantity)
        .times(line.quantity)
        .toDecimalPlaces(6);
      returnAmount = returnAmount.plus(lineAmount);
      return {
        exception_id: exceptionId,
        custody_holding_id: line.custody_holding_id,
        order_item_id: line.order_item_id,
        batch_id: line.batch_id,
        location_id: line.location_id,
        quantity: line.quantity,
        unit_cost_iqd: line.unit_cost_iqd,
        return_amount_iqd: lineAmount,
      };
    });
    if (!returnAmount.gt(0)) {
      throw conflict(
        'RETURN_HAS_NO_REFUNDABLE_VALUE',
        'Return has no refundable goods value',
      );
    }
    const exceptionOffset = Prisma.Decimal.min(returnAmount, openShortfall);
    const refundPayable = returnAmount.minus(exceptionOffset);
    await tx.custodyException.create({
      data: {
        id: exceptionId,
        document_number: documentNumber,
        operation_id: input.operation_id,
        type: 'return_against_uncollected',
        party_id: collection.party_id,
        order_id: order.id,
        collection_id: collection.id,
        amount_iqd: returnAmount,
        goods_cost_iqd: stock.total,
        exception_offset_iqd: exceptionOffset,
        refund_payable_iqd: refundPayable,
        reason: input.reason.trim(),
        document_date: dates.documentDate,
        accounting_date: dates.accountingDate,
        backdate_reason: dates.backdateReason ?? null,
        created_by: actor.id,
      },
    });
    await tx.custodyExceptionLine.createMany({ data: persistedLines });
    await this.post(
      tx,
      exceptionId,
      'return_value',
      'return_against_uncollected',
      dates,
      actor.id,
      `Return against uncollected order ${order.order_number}`,
      this.exceptionPosting('return_against_uncollected', {
        returnAmount: returnAmount.toString(),
        exceptionOffset: exceptionOffset.toString(),
        refundPayable: refundPayable.toString(),
      }),
    );
    await this.post(
      tx,
      exceptionId,
      'restock_issue_cost',
      'restock_issue_cost',
      dates,
      actor.id,
      `Returned goods restocked at original issue cost for ${order.order_number}`,
      this.simplePosting('1000', '5000', stock.total),
    );
    await this.applyReturnLifecycle(tx, order.id, order.status, documentNumber);
    await this.audit.record(tx, {
      actorId: actor.id,
      action: 'custody_exception.return_uncollected',
      entityType: 'custody_exception',
      entityId: exceptionId,
      after: {
        document_number: documentNumber,
        order_id: order.id,
        party_id: collection.party_id,
        return_amount_iqd: returnAmount.toString(),
        exception_offset_iqd: exceptionOffset.toString(),
        refund_payable_iqd: refundPayable.toString(),
      },
      reason: input.reason.trim(),
    });
    await this.tripHistory.recordForOrder(tx, {
      actorId: actor.id,
      operationId: input.operation_id,
      orderId: order.id,
      expectedTripId: options.expectedTripId,
      requireInProgress: options.requireTripInProgress,
      type: 'return_at_door',
      source: options.source ?? 'custody_exception',
      note: input.reason,
      eventAt: options.eventAt ?? new Date(),
    });
    return this.detailTx(tx, exceptionId, this.canViewCost(actor));
  }

  private async returnRetailValueTx(
    tx: Tx,
    orderId: string,
    partyId: string | null,
    lines: Array<{ custody_holding_id: string; quantity: string }>,
  ) {
    if (!partyId) {
      throw conflict(
        'DELIVERY_PARTY_REQUIRED',
        'Delivery has no assigned custody party',
      );
    }
    let total = new Prisma.Decimal(0);
    for (const line of lines) {
      const holding = await tx.custodyHolding.findUnique({
        where: { id: line.custody_holding_id },
        include: { order_item: true },
      });
      if (!holding) throw new NotFoundException('Custody holding not found');
      if (
        holding.order_id !== orderId ||
        holding.custody_party_id !== partyId
      ) {
        throw conflict(
          'CUSTODY_HOLDING_WRONG_ORDER_OR_PARTY',
          'Custody holding does not belong to this order and party',
        );
      }
      if (holding.status !== 'in_custody') {
        throw conflict(
          'GOODS_NOT_IN_CUSTODY',
          'Goods are no longer in custody',
        );
      }
      const quantity = this.positive(line.quantity, 'quantity');
      if (quantity.gt(holding.remaining_quantity)) {
        throw conflict(
          'CUSTODY_EXCEPTION_EXCEEDS_GOODS',
          'Exception quantity exceeds goods custody',
        );
      }
      total = total.plus(
        holding.order_item.line_total
          .div(holding.order_item.quantity)
          .times(quantity)
          .toDecimalPlaces(6),
      );
    }
    if (!total.gt(0)) {
      throw conflict(
        'RETURN_HAS_NO_REFUNDABLE_VALUE',
        'Return has no refundable goods value',
      );
    }
    return total;
  }

  async refundDeliveryFee(actor: Actor, input: CreateDeliveryFeeRefundDto) {
    const amount = this.positive(input.amount_iqd, 'amount_iqd');
    if (input.settlement_method === 'cash_account' && !input.cash_account_id) {
      throw invalid(
        'REFUND_CASH_ACCOUNT_REQUIRED',
        'cash_account_id is required for a cash-account refund',
      );
    }
    if (input.settlement_method === 'uncollected' && input.cash_account_id) {
      throw invalid(
        'REFUND_CASH_ACCOUNT_NOT_ALLOWED',
        'cash_account_id must be omitted when netting an uncollected amount',
      );
    }
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions: actor.permissions,
    });
    return this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint: 'POST /admin/custody-exceptions/delivery-fee-refund',
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        await this.lockOrder(tx, input.order_id);
        const order = await tx.order.findUnique({
          where: { id: input.order_id },
          include: {
            delivery_collection: { include: { party: true } },
          },
        });
        if (!order) throw new NotFoundException('Order not found');
        const collection = order.delivery_collection;
        if (!collection) {
          throw conflict(
            'DELIVERY_REVENUE_NOT_POSTED',
            'Delivery fee can be refunded only after delivery revenue was posted',
          );
        }
        await this.assertActorSeparation(
          tx,
          actor.id,
          collection.party.user_id,
          order.id,
          collection.delivered_by,
        );
        const prior = await tx.custodyException.aggregate({
          where: {
            order_id: order.id,
            type: 'delivery_fee_refund',
            reversal: { is: null },
          },
          _sum: { amount_iqd: true },
        });
        const remaining = order.delivery_fee.minus(prior._sum.amount_iqd ?? 0);
        if (amount.gt(remaining)) {
          throw conflict(
            'DELIVERY_FEE_REFUND_EXCEEDS_CHARGE',
            'Delivery-fee refund exceeds the amount originally charged',
          );
        }
        let cashAccount: {
          id: string;
          ledger_account: { code: string };
        } | null = null;
        let offset = new Prisma.Decimal(0);
        if (input.settlement_method === 'cash_account') {
          cashAccount = await tx.cashAccount.findUnique({
            where: { id: input.cash_account_id! },
            include: { ledger_account: { select: { code: true } } },
          });
          if (!cashAccount)
            throw new NotFoundException('Cash account not found');
          const fullCash = await tx.cashAccount.findUniqueOrThrow({
            where: { id: cashAccount.id },
          });
          if (!fullCash.is_active || fullCash.currency_code !== 'IQD') {
            throw conflict(
              'REFUND_REQUIRES_ACTIVE_IQD_ACCOUNT',
              'Refund requires an active IQD cash account',
            );
          }
        } else {
          offset = amount;
          const open = await this.openShortfall(tx, collection);
          if (amount.gt(open)) {
            throw conflict(
              'DELIVERY_FEE_REFUND_EXCEEDS_UNCOLLECTED',
              'Delivery-fee refund exceeds the uncollected amount',
            );
          }
        }
        const exceptionId = randomUUID();
        const documentNumber = await this.numbers.issue(
          tx,
          'custody_exception',
          'CEX',
          dates.documentDate,
        );
        await tx.custodyException.create({
          data: {
            id: exceptionId,
            document_number: documentNumber,
            operation_id: input.operation_id,
            type: 'delivery_fee_refund',
            party_id: collection.party_id,
            order_id: order.id,
            collection_id: collection.id,
            settlement_method: input.settlement_method,
            cash_account_id: cashAccount?.id,
            amount_iqd: amount,
            exception_offset_iqd: offset,
            reason: input.reason.trim(),
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            backdate_reason: dates.backdateReason ?? null,
            created_by: actor.id,
          },
        });
        await this.post(
          tx,
          exceptionId,
          'delivery_fee_refund',
          'delivery_fee_refund',
          dates,
          actor.id,
          `Delivery-fee refund for ${order.order_number}`,
          this.exceptionPosting('delivery_fee_refund', {
            deliveryFee: amount.toString(),
          }),
        );
        await this.post(
          tx,
          exceptionId,
          'refund_settlement',
          input.settlement_method === 'cash_account'
            ? 'refund_payment'
            : 'refund_netted_uncollected',
          dates,
          actor.id,
          `Delivery-fee refund settled by ${input.settlement_method}`,
          this.simplePosting(
            '2030',
            cashAccount?.ledger_account.code ?? '1040',
            amount,
          ),
        );
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'custody_exception.delivery_fee_refund',
          entityType: 'custody_exception',
          entityId: exceptionId,
          after: {
            document_number: documentNumber,
            order_id: order.id,
            amount_iqd: amount.toString(),
            settlement_method: input.settlement_method,
            cash_account_id: cashAccount?.id ?? null,
          },
          reason: input.reason.trim(),
        });
        return this.detailTx(tx, exceptionId, this.canViewCost(actor));
      },
    });
  }

  async reverse(actor: Actor, id: string, input: ReverseCustodyExceptionDto) {
    const today = custodyExceptionBusinessDate();
    const dates = await this.dates.validate({
      documentDate: today,
      accountingDate: today,
      permissions: actor.permissions,
    });
    return this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint: `POST /admin/custody-exceptions/${id}/reversal`,
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        await tx.$queryRaw`SELECT id FROM custody_exceptions WHERE id = ${id}::uuid FOR UPDATE`;
        const exception = await tx.custodyException.findUnique({
          where: { id },
          include: {
            party: true,
            order: true,
            lines: true,
            postings: {
              include: {
                journal_entry: {
                  include: { lines: { include: { account: true } } },
                },
              },
            },
            reversal: true,
          },
        });
        if (!exception)
          throw new NotFoundException('Custody exception not found');
        if (exception.reversal) {
          throw conflict(
            'CUSTODY_EXCEPTION_ALREADY_REVERSED',
            'Custody exception is already reversed',
          );
        }
        assertDifferentActor(
          actor.id,
          exception.created_by,
          'A user cannot reverse their own custody exception',
          'SELF_REVERSAL_FORBIDDEN',
        );
        if (exception.party.user_id) {
          assertDifferentActor(
            actor.id,
            exception.party.user_id,
            'A delivery party cannot reverse an exception in their own custody',
          );
        }
        if (
          exception.type === 'goods_loss' &&
          exception.liability_bearer === 'party'
        ) {
          await this.assertPartyLiabilityCanReverse(
            tx,
            exception.party_id,
            exception.amount_iqd,
          );
        }
        const reversalId = randomUUID();
        const documentNumber = await this.numbers.issue(
          tx,
          'custody_exception_reversal',
          'CEX-REV',
          dates.documentDate,
        );
        await tx.custodyExceptionReversal.create({
          data: {
            id: reversalId,
            document_number: documentNumber,
            operation_id: input.operation_id,
            exception_id: exception.id,
            reason: input.reason.trim(),
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            created_by: actor.id,
          },
        });
        await this.inventory.reverseCustodyExceptionStock(tx, {
          exceptionId: exception.id,
          reversalId,
          type: exception.type,
          partyId: exception.party_id,
          actorId: actor.id,
          lines: exception.lines,
        });
        for (const posting of exception.postings) {
          const entry = await this.ledger.post(tx, {
            sourceType: 'custody_exception_reversal',
            sourceId: reversalId,
            event: `reverse:${posting.role}`,
            documentDate: dates.documentDate,
            accountingDate: dates.accountingDate,
            createdBy: actor.id,
            description: `Reversal of ${exception.document_number}: ${input.reason.trim()}`,
            reversesId: posting.journal_entry_id,
            lines: posting.journal_entry.lines.map((line) => ({
              accountCode: line.account.code,
              side: line.debit_base.gt(0) ? 'credit' : 'debit',
              baseAmount: line.debit_base.gt(0)
                ? line.debit_base.toString()
                : line.credit_base.toString(),
              currencyCode: line.currency_code,
              originalAmount: line.original_amount.toString(),
              exchangeRate: line.exchange_rate.toString(),
              memo: `Reversal of ${exception.document_number}`,
            })),
          });
          await tx.custodyExceptionReversalPosting.create({
            data: {
              reversal_id: reversalId,
              role: posting.role,
              journal_entry_id: entry.id,
              original_journal_entry_id: posting.journal_entry_id,
            },
          });
        }
        await this.reverseLifecycle(tx, exception, documentNumber);
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'custody_exception.reverse',
          entityType: 'custody_exception',
          entityId: exception.id,
          before: { status: 'active' },
          after: {
            status: 'reversed',
            reversal_id: reversalId,
            document_number: documentNumber,
          },
          reason: input.reason.trim(),
        });
        return this.detailTx(tx, exception.id, this.canViewCost(actor));
      },
    });
  }

  async list(query: CustodyExceptionQueryDto, permissions: readonly string[]) {
    this.assertDateRange(query.date_from, query.date_to);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const where: Prisma.CustodyExceptionWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.party_id ? { party_id: query.party_id } : {}),
      ...(query.order_id ? { order_id: query.order_id } : {}),
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
      ...(query.status === 'active'
        ? { reversal: { is: null } }
        : query.status === 'reversed'
          ? { reversal: { isNot: null } }
          : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.custodyException.count({ where }),
      this.prisma.custodyException.findMany({
        where,
        include: exceptionInclude,
        orderBy: [
          { document_date: 'desc' },
          { created_at: 'desc' },
          { id: 'desc' },
        ],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    const canViewCost = permissions.includes('cost.view');
    return {
      page,
      per_page: perPage,
      total,
      data: rows.map((row) => this.present(row, canViewCost)),
    };
  }

  async get(id: string, permissions: readonly string[]) {
    return this.detailTx(this.prisma, id, permissions.includes('cost.view'));
  }

  private async detailTx(
    tx: Tx | PrismaService,
    id: string,
    canViewCost: boolean,
  ) {
    const row = await tx.custodyException.findUnique({
      where: { id },
      include: exceptionInclude,
    });
    if (!row) throw new NotFoundException('Custody exception not found');
    return this.present(row, canViewCost);
  }

  private present(
    row: Prisma.CustodyExceptionGetPayload<{
      include: typeof exceptionInclude;
    }>,
    canViewCost: boolean,
  ) {
    return {
      id: row.id,
      document_number: row.document_number,
      operation_id: row.operation_id,
      type: row.type,
      status: row.reversal ? 'reversed' : 'active',
      party_id: row.party_id,
      order_id: row.order_id,
      collection_id: row.collection_id,
      liability_bearer: row.liability_bearer,
      settlement_method: row.settlement_method,
      cash_account_id: row.cash_account_id,
      amount_iqd: Number(row.amount_iqd),
      exception_offset_iqd: Number(row.exception_offset_iqd),
      refund_payable_iqd: Number(row.refund_payable_iqd),
      ...(canViewCost ? { goods_cost_iqd: Number(row.goods_cost_iqd) } : {}),
      reason: row.reason,
      document_date: businessDateText(row.document_date),
      accounting_date: businessDateText(row.accounting_date),
      backdate_reason: row.backdate_reason,
      created_by: row.created_by,
      created_by_name: actorDisplayName(row.creator),
      created_at: row.created_at,
      party: row.party,
      order: row.order,
      collection: row.collection
        ? {
            ...row.collection,
            due_amount: Number(row.collection.due_amount),
            collected_amount:
              row.collection.collected_amount === null
                ? null
                : Number(row.collection.collected_amount),
            shortfall_amount:
              row.collection.shortfall_amount === null
                ? null
                : Number(row.collection.shortfall_amount),
          }
        : null,
      cash_account: row.cash_account,
      lines: row.lines.map((line) => ({
        id: line.id,
        custody_holding_id: line.custody_holding_id,
        order_item_id: line.order_item_id,
        batch_id: line.batch_id,
        location_id: line.location_id,
        quantity: Number(line.quantity),
        return_amount_iqd: Number(line.return_amount_iqd),
        ...(canViewCost ? { unit_cost_iqd: Number(line.unit_cost_iqd) } : {}),
        order_item: line.order_item,
        batch: line.batch,
        location: line.location,
      })),
      postings: row.postings.map((posting) => ({
        role: posting.role,
        journal_entry_id: posting.journal_entry_id,
        event: posting.journal_entry.event,
      })),
      reversal: row.reversal
        ? {
            id: row.reversal.id,
            document_number: row.reversal.document_number,
            operation_id: row.reversal.operation_id,
            reason: row.reversal.reason,
            document_date: businessDateText(row.reversal.document_date),
            accounting_date: businessDateText(row.reversal.accounting_date),
            created_by: row.reversal.created_by,
            created_by_name: actorDisplayName(row.reversal.creator),
            created_at: row.reversal.created_at,
            postings: row.reversal.postings.map((posting) => ({
              role: posting.role,
              journal_entry_id: posting.journal_entry_id,
              original_journal_entry_id: posting.original_journal_entry_id,
              event: posting.journal_entry.event,
            })),
          }
        : null,
    };
  }

  private async post(
    tx: Tx,
    exceptionId: string,
    role: string,
    event: string,
    dates: { documentDate: Date; accountingDate: Date },
    actorId: string,
    description: string,
    lines: PostingLine[],
  ) {
    const entry = await this.ledger.post(tx, {
      sourceType: 'custody_exception',
      sourceId: exceptionId,
      event,
      documentDate: dates.documentDate,
      accountingDate: dates.accountingDate,
      createdBy: actorId,
      description,
      lines,
    });
    await tx.custodyExceptionPosting.create({
      data: {
        exception_id: exceptionId,
        role,
        journal_entry_id: entry.id,
      },
    });
    return entry;
  }

  private exceptionPosting(
    scenario: CustodyExceptionPostingScenario,
    values: Partial<CustodyExceptionPostingAmounts>,
  ): PostingLine[] {
    const amounts: CustodyExceptionPostingAmounts = {
      resolved: '0',
      returnAmount: '0',
      exceptionOffset: '0',
      refundPayable: '0',
      deliveryFee: '0',
      ...values,
    };
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

  private simplePosting(
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

  private async openShortfall(
    tx: Tx,
    collection: {
      id: string;
      shortfall_amount: Prisma.Decimal | null;
    },
  ) {
    const offsets = await tx.custodyException.aggregate({
      where: {
        collection_id: collection.id,
        reversal: { is: null },
      },
      _sum: { exception_offset_iqd: true },
    });
    return Prisma.Decimal.max(
      0,
      (collection.shortfall_amount ?? new Prisma.Decimal(0)).minus(
        offsets._sum.exception_offset_iqd ?? 0,
      ),
    );
  }

  private async assertActorSeparation(
    tx: Tx,
    actorId: string,
    partyUserId: string | null,
    orderId: string,
    deliveryActorId?: string,
  ) {
    if (partyUserId) {
      assertDifferentActor(
        actorId,
        partyUserId,
        'A delivery party cannot approve an exception in their own custody',
      );
    }
    if ((await separationOfDutiesLevel(tx)) !== 'strict') return;
    if (deliveryActorId) {
      assertDifferentActor(
        actorId,
        deliveryActorId,
        'Strict separation of duties requires another user to record the exception',
      );
      return;
    }
    const handover = await tx.stockMovement.findFirst({
      where: {
        source_type: 'order',
        source_id: orderId,
        type: 'issue_to_custody',
      },
      select: { user_id: true },
      orderBy: { created_at: 'asc' },
    });
    if (handover?.user_id) {
      assertDifferentActor(
        actorId,
        handover.user_id,
        'Strict separation of duties requires another user to record the exception',
      );
    }
  }

  private async applyLossLifecycle(
    tx: Tx,
    orderId: string,
    currentStatus: string,
    deliveryId: string,
    documentNumber: string,
  ) {
    const remaining = await tx.custodyHolding.aggregate({
      where: {
        order_id: orderId,
        status: 'in_custody',
        remaining_quantity: { gt: 0 },
      },
      _sum: { remaining_quantity: true },
    });
    const target = new Prisma.Decimal(
      remaining._sum.remaining_quantity ?? 0,
    ).isZero()
      ? 'cancelled'
      : 'failed';
    if (currentStatus !== target && currentStatus !== 'cancelled') {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: target,
          version: { increment: 1 },
          inventory_attention_required: true,
        },
      });
      await tx.orderStatusEvent.create({
        data: {
          order_id: orderId,
          status: target,
          note: `Custody exception ${documentNumber}`,
        },
      });
    } else {
      await tx.order.update({
        where: { id: orderId },
        data: { inventory_attention_required: true },
      });
    }
    await tx.delivery.update({
      where: { id: deliveryId },
      data: {
        status: 'failed',
        failure_reason: `Custody exception ${documentNumber}`,
        failed_at: new Date(),
      },
    });
  }

  private async applyReturnLifecycle(
    tx: Tx,
    orderId: string,
    currentStatus: string,
    documentNumber: string,
  ) {
    const holdings = await tx.custodyHolding.findMany({
      where: { order_id: orderId, status: 'sold' },
      select: { id: true, quantity: true },
    });
    const activeReturns = await tx.custodyExceptionLine.groupBy({
      by: ['custody_holding_id'],
      where: {
        custody_holding_id: { in: holdings.map((row) => row.id) },
        exception: {
          type: 'return_against_uncollected',
          reversal: { is: null },
        },
      },
      _sum: { quantity: true },
    });
    const returnedByHolding = new Map(
      activeReturns.map((row) => [
        row.custody_holding_id,
        row._sum.quantity ?? new Prisma.Decimal(0),
      ]),
    );
    const complete = holdings.every((holding) =>
      (returnedByHolding.get(holding.id) ?? new Prisma.Decimal(0)).gte(
        holding.quantity,
      ),
    );
    if (!complete) {
      await tx.order.update({
        where: { id: orderId },
        data: { inventory_attention_required: true },
      });
      return;
    }
    if (currentStatus !== 'returned') {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'returned',
          version: { increment: 1 },
          inventory_attention_required: false,
        },
      });
      await tx.orderStatusEvent.create({
        data: {
          order_id: orderId,
          status: 'returned',
          note: `Return against uncollected ${documentNumber}`,
        },
      });
    }
    const delivery = await tx.delivery.findFirst({
      where: { order_id: orderId },
      orderBy: { delivered_at: 'desc' },
    });
    if (delivery) {
      await tx.delivery.update({
        where: { id: delivery.id },
        data: { status: 'returned' },
      });
    }
  }

  private async reverseLifecycle(
    tx: Tx,
    exception: {
      type: string;
      order_id: string;
      order: { status: string; version: number };
      document_number: string;
    },
    reversalNumber: string,
  ) {
    if (exception.type === 'delivery_fee_refund') return;
    const target =
      exception.type === 'return_against_uncollected' ? 'delivered' : 'failed';
    if (exception.order.status === target) return;
    await tx.order.update({
      where: { id: exception.order_id },
      data: {
        status: target,
        version: { increment: 1 },
        inventory_attention_required: exception.type === 'goods_loss',
      },
    });
    await tx.orderStatusEvent.create({
      data: {
        order_id: exception.order_id,
        status: target,
        note: `Reversal ${reversalNumber} of ${exception.document_number}`,
      },
    });
    if (exception.type === 'return_against_uncollected') {
      const delivery = await tx.delivery.findFirst({
        where: { order_id: exception.order_id },
        orderBy: { delivered_at: 'desc' },
      });
      if (delivery) {
        await tx.delivery.update({
          where: { id: delivery.id },
          data: { status: 'delivered' },
        });
      }
    }
  }

  private async assertPartyLiabilityCanReverse(
    tx: Tx,
    partyId: string,
    removing: Prisma.Decimal,
  ) {
    const [collections, receipts, liabilities] = await Promise.all([
      tx.deliveryCollection.aggregate({
        where: {
          party_id: partyId,
          status: { in: ['confirmed_full', 'confirmed_short'] },
          collected_amount: { not: null },
        },
        _sum: { collected_amount: true },
      }),
      tx.cashReceiptVoucher.aggregate({
        where: { party_id: partyId, reversal: { is: null } },
        _sum: { amount_iqd: true },
      }),
      tx.custodyException.aggregate({
        where: {
          party_id: partyId,
          type: 'goods_loss',
          liability_bearer: 'party',
          reversal: { is: null },
        },
        _sum: { amount_iqd: true },
      }),
    ]);
    const after = new Prisma.Decimal(collections._sum.collected_amount ?? 0)
      .plus(liabilities._sum.amount_iqd ?? 0)
      .minus(removing)
      .minus(receipts._sum.amount_iqd ?? 0);
    if (after.lt(0)) {
      throw conflict(
        'RECEIPT_REVERSAL_REQUIRED',
        'Reverse the cash receipt that consumed this party liability first',
      );
    }
  }

  private lockOrder(tx: Tx, orderId: string) {
    return tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
  }

  private assertUniqueHoldings(lines: Array<{ custody_holding_id: string }>) {
    if (
      new Set(lines.map((line) => line.custody_holding_id)).size !==
      lines.length
    ) {
      throw invalid(
        'CUSTODY_HOLDING_DUPLICATED',
        'Custody holdings must not repeat within one exception',
      );
    }
  }

  private assertDateRange(from?: string, to?: string) {
    if (from && to && from > to) {
      throw invalid(
        'DATE_RANGE_INVALID',
        'date_from must be on or before date_to',
      );
    }
  }

  private positive(value: string, field: string) {
    const amount = new Prisma.Decimal(value);
    if (!amount.gt(0)) {
      throw invalid('AMOUNT_NOT_POSITIVE', `${field} must be positive`);
    }
    return amount;
  }

  private canViewCost(actor: Actor) {
    return actor.permissions.includes('cost.view');
  }
}
