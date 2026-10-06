import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  assertDifferentActor,
  separationOfDutiesLevel,
} from '../../common/access/separation-of-duties';
import { AuditService } from '../audit/audit.service';
import {
  AllocateCashReceiptDto,
  CashReceiptAllocationItemDto,
  CashReceiptQueryDto,
  CashReceiptSuggestionQueryDto,
  CreateCashReceiptDto,
  ReverseCashReceiptDto,
} from './dto/cash-receipt.dto';
import { businessDateText, parseBusinessDate } from './business-date';
import { DateRulesService } from './date-rules.service';
import { DocumentNumberService } from './document-number.service';
import { LedgerService } from './ledger.service';
import { OperationService } from './operation.service';

type Actor = { id: string; permissions: readonly string[] };
type Tx = Prisma.TransactionClient;

const receiptInclude = {
  party: {
    select: {
      id: true,
      kind: true,
      user_id: true,
      name: true,
      phone: true,
      vehicle_number: true,
      is_active: true,
    },
  },
  cash_account: {
    select: {
      id: true,
      name: true,
      kind: true,
      currency_code: true,
      is_active: true,
      ledger_account: { select: { code: true } },
    },
  },
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
        orderBy: [{ created_at: 'asc' as const }, { id: 'asc' as const }],
      },
    },
    orderBy: [{ created_at: 'asc' as const }, { id: 'asc' as const }],
  },
  reversal: true,
} satisfies Prisma.CashReceiptVoucherInclude;

@Injectable()
export class CashReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dates: DateRulesService,
    private readonly ledger: LedgerService,
    private readonly numbers: DocumentNumberService,
    private readonly operations: OperationService,
  ) {}

  async create(actor: Actor, input: CreateCashReceiptDto) {
    if (
      input.allocations.length &&
      !actor.permissions.includes('cash_receipts.allocate')
    ) {
      throw new ForbiddenException(
        'Allocating a new receipt requires cash_receipts.allocate',
      );
    }
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions: actor.permissions,
    });
    const amount = this.positive(input.amount_iqd, 'amount_iqd');
    return this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint: 'POST /admin/cash-receipts',
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        await tx.$queryRaw<Array<{ locked: string }>>(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`cash-custody:${input.party_id}`}))::text AS locked`,
        );
        const [party, cash] = await Promise.all([
          tx.deliveryParty.findUnique({ where: { id: input.party_id } }),
          tx.cashAccount.findUnique({
            where: { id: input.cash_account_id },
            include: { ledger_account: { select: { code: true } } },
          }),
        ]);
        if (!party) throw new NotFoundException('Delivery party not found');
        if (!party.is_active)
          throw new ConflictException('Delivery party is inactive');
        this.assertPartyActor(actor.id, party.user_id);
        if (
          input.allocations.length &&
          (await separationOfDutiesLevel(tx)) === 'strict'
        ) {
          throw new ForbiddenException({
            status: 403,
            code: 'SEPARATION_OF_DUTIES_VIOLATION',
            message:
              'Strict separation of duties requires another user to allocate the receipt after it is created',
            errors: [],
          });
        }
        if (!cash) throw new NotFoundException('Cash account not found');
        if (!cash.is_active)
          throw new ConflictException('Cash account is inactive');
        if (cash.currency_code !== 'IQD') {
          throw new UnprocessableEntityException(
            'Delivery-party cash receipts require an IQD cash account',
          );
        }
        const [collections, priorReceipts] = await Promise.all([
          tx.deliveryCollection.aggregate({
            where: {
              party_id: party.id,
              status: { in: ['confirmed_full', 'confirmed_short'] },
              collected_amount: { not: null },
            },
            _sum: { collected_amount: true },
          }),
          tx.cashReceiptVoucher.aggregate({
            where: { party_id: party.id, reversal: { is: null } },
            _sum: { amount_iqd: true },
          }),
        ]);
        const cashCustody = new Prisma.Decimal(
          collections._sum.collected_amount ?? 0,
        ).minus(priorReceipts._sum.amount_iqd ?? 0);
        if (amount.gt(cashCustody)) {
          throw new ConflictException(
            'Receipt amount exceeds the party’s cash custody balance',
          );
        }

        const voucherId = randomUUID();
        const entry = await this.ledger.post(tx, {
          sourceType: 'cash_receipt',
          sourceId: voucherId,
          event: 'cash_received',
          documentDate: dates.documentDate,
          accountingDate: dates.accountingDate,
          createdBy: actor.id,
          description: `Cash received from delivery party ${party.name}`,
          lines: [
            {
              accountCode: cash.ledger_account.code,
              side: 'debit',
              baseAmount: amount.toString(),
              currencyCode: 'IQD',
              originalAmount: amount.toString(),
              exchangeRate: '1',
            },
            {
              accountCode: '1020',
              side: 'credit',
              baseAmount: amount.toString(),
              currencyCode: 'IQD',
              originalAmount: amount.toString(),
              exchangeRate: '1',
            },
          ],
        });
        const documentNumber = await this.numbers.issue(
          tx,
          'cash_receipt',
          'CRV',
          dates.documentDate,
        );
        await tx.cashReceiptVoucher.create({
          data: {
            id: voucherId,
            document_number: documentNumber,
            operation_id: input.operation_id,
            party_id: party.id,
            cash_account_id: cash.id,
            amount_iqd: amount,
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            backdate_reason: dates.backdateReason ?? null,
            reference: input.reference?.trim() || null,
            notes: input.notes?.trim() || null,
            created_by: actor.id,
            journal_entry_id: entry.id,
          },
        });
        if (input.allocations.length) {
          const initialBatch = await this.createAllocationBatch(tx, {
            actorId: actor.id,
            operationId: input.operation_id,
            voucherId,
            partyId: party.id,
            receiptAmount: amount,
            dates,
            items: input.allocations,
          });
          await this.audit.record(tx, {
            actorId: actor.id,
            action: 'cash_receipt.allocate',
            entityType: 'cash_receipt_allocation_batch',
            entityId: initialBatch.id,
            after: {
              voucher_id: voucherId,
              allocation_count: input.allocations.length,
              allocated_amount_iqd: input.allocations
                .reduce(
                  (sum, item) => sum.plus(item.amount_iqd),
                  new Prisma.Decimal(0),
                )
                .toString(),
              source: 'initial_receipt',
            },
          });
        }
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'cash_receipt.create',
          entityType: 'cash_receipt_voucher',
          entityId: voucherId,
          after: {
            document_number: documentNumber,
            party_id: party.id,
            cash_account_id: cash.id,
            amount_iqd: amount.toString(),
            allocation_count: input.allocations.length,
          },
        });
        return this.detailTx(tx, voucherId);
      },
    });
  }

  async allocate(
    actor: Actor,
    voucherId: string,
    input: AllocateCashReceiptDto,
  ) {
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions: actor.permissions,
    });
    return this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint: `POST /admin/cash-receipts/${voucherId}/allocations`,
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        await tx.$queryRaw`SELECT id FROM cash_receipt_vouchers WHERE id = ${voucherId}::uuid FOR UPDATE`;
        const voucher = await tx.cashReceiptVoucher.findUnique({
          where: { id: voucherId },
          include: { party: true, reversal: true },
        });
        if (!voucher) throw new NotFoundException('Cash receipt not found');
        if (voucher.reversal)
          throw new ConflictException(
            'A reversed cash receipt cannot be allocated',
          );
        this.assertPartyActor(actor.id, voucher.party.user_id);
        if (
          actor.id === voucher.created_by &&
          (await separationOfDutiesLevel(tx)) === 'strict'
        ) {
          throw new ForbiddenException({
            status: 403,
            code: 'SEPARATION_OF_DUTIES_VIOLATION',
            message:
              'Strict separation of duties requires another user to allocate the receipt',
            errors: [],
          });
        }
        const batch = await this.createAllocationBatch(tx, {
          actorId: actor.id,
          operationId: input.operation_id,
          voucherId,
          partyId: voucher.party_id,
          receiptAmount: voucher.amount_iqd,
          dates,
          items: input.allocations,
        });
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'cash_receipt.allocate',
          entityType: 'cash_receipt_allocation_batch',
          entityId: batch.id,
          after: {
            voucher_id: voucherId,
            allocation_count: input.allocations.length,
            allocated_amount_iqd: input.allocations
              .reduce(
                (sum, item) => sum.plus(item.amount_iqd),
                new Prisma.Decimal(0),
              )
              .toString(),
          },
        });
        return this.detailTx(tx, voucherId);
      },
    });
  }

  async reverse(actor: Actor, voucherId: string, input: ReverseCashReceiptDto) {
    const today = businessDateText();
    const dates = await this.dates.validate({
      documentDate: today,
      accountingDate: today,
      permissions: actor.permissions,
    });
    return this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint: `POST /admin/cash-receipts/${voucherId}/reversal`,
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        await tx.$queryRaw`SELECT id FROM cash_receipt_vouchers WHERE id = ${voucherId}::uuid FOR UPDATE`;
        const voucher = await tx.cashReceiptVoucher.findUnique({
          where: { id: voucherId },
          include: {
            party: true,
            reversal: true,
            journal_entry: {
              include: { lines: { include: { account: true } } },
            },
          },
        });
        if (!voucher) throw new NotFoundException('Cash receipt not found');
        if (voucher.reversal)
          throw new ConflictException('Cash receipt is already reversed');
        this.assertPartyActor(actor.id, voucher.party.user_id);
        assertDifferentActor(
          actor.id,
          voucher.created_by,
          'A user cannot reverse their own cash receipt voucher',
        );

        const reversalId = randomUUID();
        const entry = await this.ledger.post(tx, {
          sourceType: 'cash_receipt_reversal',
          sourceId: reversalId,
          event: 'reverse',
          documentDate: dates.documentDate,
          accountingDate: dates.accountingDate,
          createdBy: actor.id,
          description: input.reason.trim(),
          reversesId: voucher.journal_entry_id,
          lines: voucher.journal_entry.lines.map((line) => ({
            accountCode: line.account.code,
            side: line.debit_base.gt(0) ? 'credit' : 'debit',
            baseAmount: line.debit_base.gt(0)
              ? line.debit_base.toString()
              : line.credit_base.toString(),
            currencyCode: line.currency_code,
            originalAmount: line.original_amount.toString(),
            exchangeRate: line.exchange_rate.toString(),
            memo: `Reversal of ${voucher.document_number}`,
          })),
        });
        const documentNumber = await this.numbers.issue(
          tx,
          'cash_receipt_reversal',
          'CRV-REV',
          dates.documentDate,
        );
        await tx.cashReceiptReversal.create({
          data: {
            id: reversalId,
            document_number: documentNumber,
            operation_id: input.operation_id,
            voucher_id: voucher.id,
            reason: input.reason.trim(),
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            created_by: actor.id,
            journal_entry_id: entry.id,
          },
        });
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'cash_receipt.reverse',
          entityType: 'cash_receipt_voucher',
          entityId: voucher.id,
          before: { status: 'active' },
          after: {
            status: 'reversed',
            reversal_id: reversalId,
            document_number: documentNumber,
          },
          reason: input.reason.trim(),
        });
        return this.detailTx(tx, voucherId);
      },
    });
  }

  async list(query: CashReceiptQueryDto) {
    this.assertDateRange(query.date_from, query.date_to);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const where: Prisma.CashReceiptVoucherWhereInput = {
      ...(query.party_id ? { party_id: query.party_id } : {}),
      ...(query.cash_account_id
        ? { cash_account_id: query.cash_account_id }
        : {}),
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
      this.prisma.cashReceiptVoucher.count({ where }),
      this.prisma.cashReceiptVoucher.findMany({
        where,
        include: receiptInclude,
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

  async unallocated(query: CashReceiptQueryDto) {
    this.assertDateRange(query.date_from, query.date_to);
    const rows = await this.prisma.cashReceiptVoucher.findMany({
      where: {
        ...(query.party_id ? { party_id: query.party_id } : {}),
        ...(query.cash_account_id
          ? { cash_account_id: query.cash_account_id }
          : {}),
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
        reversal: { is: null },
      },
      include: receiptInclude,
      orderBy: [{ document_date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
    });
    const open = rows
      .map((row) => this.present(row))
      .filter((row) => row.unallocated_amount_iqd > 0);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    return {
      page,
      per_page: perPage,
      total: open.length,
      data: open.slice((page - 1) * perPage, page * perPage),
    };
  }

  async get(id: string) {
    const row = await this.prisma.cashReceiptVoucher.findUnique({
      where: { id },
      include: receiptInclude,
    });
    if (!row) throw new NotFoundException('Cash receipt not found');
    return this.present(row);
  }

  async suggestions(query: CashReceiptSuggestionQueryDto) {
    const party = await this.prisma.deliveryParty.findUnique({
      where: { id: query.party_id },
      select: { id: true, name: true },
    });
    if (!party) throw new NotFoundException('Delivery party not found');
    const requested = query.amount_iqd
      ? this.positive(query.amount_iqd, 'amount_iqd')
      : null;
    const rows = await this.prisma.deliveryCollection.findMany({
      where: {
        party_id: party.id,
        status: { in: ['confirmed_full', 'confirmed_short'] },
        collected_amount: { not: null },
      },
      include: {
        order: { select: { id: true, order_number: true } },
        cash_receipt_allocations: {
          where: { batch: { voucher: { reversal: { is: null } } } },
          select: { amount_iqd: true },
        },
      },
      orderBy: [
        { confirmed_at: 'asc' },
        { delivered_at: 'asc' },
        { id: 'asc' },
      ],
      take: query.per_page ?? 100,
    });
    let left = requested;
    const data = rows.flatMap((row) => {
      const collected = row.collected_amount ?? new Prisma.Decimal(0);
      const allocated = row.cash_receipt_allocations.reduce(
        (sum, allocation) => sum.plus(allocation.amount_iqd),
        new Prisma.Decimal(0),
      );
      const remaining = collected.minus(allocated);
      if (!remaining.gt(0)) return [];
      const suggested = left ? Prisma.Decimal.min(remaining, left) : remaining;
      if (left) left = Prisma.Decimal.max(0, left.minus(suggested));
      return [
        {
          collection_id: row.id,
          order: row.order,
          collected_amount_iqd: Number(collected),
          allocated_amount_iqd: Number(allocated),
          unsettled_amount_iqd: Number(remaining),
          suggested_amount_iqd: Number(suggested),
          collected_at: row.confirmed_at ?? row.delivered_at,
        },
      ];
    });
    return {
      party,
      requested_amount_iqd: requested === null ? null : Number(requested),
      suggested_amount_iqd: data.reduce(
        (sum, row) => sum + row.suggested_amount_iqd,
        0,
      ),
      data,
    };
  }

  private async createAllocationBatch(
    tx: Tx,
    input: {
      actorId: string;
      operationId: string;
      voucherId: string;
      partyId: string;
      receiptAmount: Prisma.Decimal;
      dates: {
        documentDate: Date;
        accountingDate: Date;
        backdateReason?: string;
      };
      items: CashReceiptAllocationItemDto[];
    },
  ) {
    const orderIds = input.items.map((item) => item.order_id);
    if (new Set(orderIds).size !== orderIds.length) {
      throw new UnprocessableEntityException(
        'An order may appear only once in an allocation batch',
      );
    }
    for (const orderId of [...orderIds].sort()) {
      await tx.$queryRaw`SELECT id FROM delivery_collections WHERE order_id = ${orderId}::uuid FOR UPDATE`;
    }
    const collections = await tx.deliveryCollection.findMany({
      where: { order_id: { in: orderIds } },
      include: {
        cash_receipt_allocations: {
          where: { batch: { voucher: { reversal: { is: null } } } },
          select: { amount_iqd: true },
        },
      },
    });
    const byOrder = new Map(collections.map((row) => [row.order_id, row]));
    const existingReceiptAllocations = await tx.cashReceiptAllocation.aggregate(
      {
        where: { batch: { voucher_id: input.voucherId } },
        _sum: { amount_iqd: true },
      },
    );
    const receiptRemaining = input.receiptAmount.minus(
      existingReceiptAllocations._sum.amount_iqd ?? 0,
    );
    let batchTotal = new Prisma.Decimal(0);
    const allocations = input.items.map((item) => {
      const amount = this.positive(item.amount_iqd, 'allocation.amount_iqd');
      batchTotal = batchTotal.plus(amount);
      const collection = byOrder.get(item.order_id);
      if (!collection)
        throw new NotFoundException('Delivered order collection not found');
      if (collection.party_id !== input.partyId) {
        throw new ConflictException(
          'A receipt cannot be allocated to another party’s order',
        );
      }
      if (
        !['confirmed_full', 'confirmed_short'].includes(collection.status) ||
        collection.collected_amount === null
      ) {
        throw new ConflictException(
          'Only confirmed collected amounts can be allocated',
        );
      }
      const alreadyAllocated = collection.cash_receipt_allocations.reduce(
        (sum, row) => sum.plus(row.amount_iqd),
        new Prisma.Decimal(0),
      );
      if (amount.gt(collection.collected_amount.minus(alreadyAllocated))) {
        throw new ConflictException(
          'Allocation exceeds the order’s unsettled collected amount',
        );
      }
      return { collectionId: collection.id, amount };
    });
    if (batchTotal.gt(receiptRemaining)) {
      throw new ConflictException(
        'Allocations exceed the receipt’s unallocated amount',
      );
    }
    const documentNumber = await this.numbers.issue(
      tx,
      'cash_receipt_allocation',
      'CRV-ALLOC',
      input.dates.documentDate,
    );
    return tx.cashReceiptAllocationBatch.create({
      data: {
        document_number: documentNumber,
        operation_id: input.operationId,
        voucher_id: input.voucherId,
        document_date: input.dates.documentDate,
        accounting_date: input.dates.accountingDate,
        backdate_reason: input.dates.backdateReason ?? null,
        created_by: input.actorId,
        allocations: {
          create: allocations.map((allocation) => ({
            collection_id: allocation.collectionId,
            amount_iqd: allocation.amount,
          })),
        },
      },
    });
  }

  private async detailTx(tx: Tx, id: string) {
    const row = await tx.cashReceiptVoucher.findUnique({
      where: { id },
      include: receiptInclude,
    });
    if (!row) throw new NotFoundException('Cash receipt not found');
    return this.present(row);
  }

  private present(
    row: Prisma.CashReceiptVoucherGetPayload<{
      include: typeof receiptInclude;
    }>,
  ) {
    const originalAllocated = row.allocation_batches.reduce(
      (sum, batch) =>
        batch.allocations.reduce(
          (inner, allocation) => inner.plus(allocation.amount_iqd),
          sum,
        ),
      new Prisma.Decimal(0),
    );
    const active = row.reversal === null;
    const allocated = active ? originalAllocated : new Prisma.Decimal(0);
    return {
      id: row.id,
      document_number: row.document_number,
      operation_id: row.operation_id,
      status: active ? ('active' as const) : ('reversed' as const),
      party_id: row.party_id,
      party: row.party,
      cash_account_id: row.cash_account_id,
      cash_account: {
        id: row.cash_account.id,
        name: row.cash_account.name,
        kind: row.cash_account.kind,
        currency_code: row.cash_account.currency_code,
        is_active: row.cash_account.is_active,
      },
      amount_iqd: Number(row.amount_iqd),
      allocated_amount_iqd: Number(allocated),
      original_allocated_amount_iqd: Number(originalAllocated),
      unallocated_amount_iqd: active
        ? Number(row.amount_iqd.minus(allocated))
        : 0,
      currency: 'IQD' as const,
      document_date: businessDateText(row.document_date),
      accounting_date: businessDateText(row.accounting_date),
      backdate_reason: row.backdate_reason,
      reference: row.reference,
      notes: row.notes,
      created_by: row.created_by,
      journal_entry_id: row.journal_entry_id,
      created_at: row.created_at,
      allocation_batches: row.allocation_batches.map((batch) => ({
        id: batch.id,
        document_number: batch.document_number,
        operation_id: batch.operation_id,
        document_date: businessDateText(batch.document_date),
        accounting_date: businessDateText(batch.accounting_date),
        backdate_reason: batch.backdate_reason,
        created_by: batch.created_by,
        created_at: batch.created_at,
        active,
        allocations: batch.allocations.map((allocation) => ({
          id: allocation.id,
          collection_id: allocation.collection_id,
          order: allocation.collection.order,
          amount_iqd: Number(allocation.amount_iqd),
          created_at: allocation.created_at,
        })),
      })),
      reversal: row.reversal
        ? {
            ...row.reversal,
            document_date: businessDateText(row.reversal.document_date),
            accounting_date: businessDateText(row.reversal.accounting_date),
          }
        : null,
    };
  }

  private positive(value: string, field: string) {
    let amount: Prisma.Decimal;
    try {
      amount = new Prisma.Decimal(value);
    } catch {
      throw new UnprocessableEntityException(`${field} must be a number`);
    }
    if (!amount.gt(0))
      throw new UnprocessableEntityException(`${field} must be positive`);
    return amount;
  }

  private assertPartyActor(actorId: string, partyUserId: string | null) {
    if (partyUserId) {
      assertDifferentActor(
        actorId,
        partyUserId,
        'A delivery party cannot receive or approve cash from their own custody',
      );
    }
  }

  private assertDateRange(from?: string, to?: string) {
    if (from && to && from > to) {
      throw new UnprocessableEntityException(
        'date_from must be on or before date_to',
      );
    }
  }
}
