import { HttpException, Injectable } from '@nestjs/common';
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
import {
  CreateOwnerTransactionDto,
  OwnerTransactionQueryDto,
  PostOwnerTransactionDto,
  ReverseOwnerTransactionDto,
} from './dto/owner-transaction.dto';
import {
  businessDateText,
  exchangeRateCutoff,
  parseBusinessDate,
} from './business-date';
import { CurrencyService } from './currency.service';
import { DateRulesService } from './date-rules.service';
import { DocumentNumberService } from './document-number.service';
import { LedgerService } from './ledger.service';
import { OperationService } from './operation.service';
import { ownerTransactionIdempotencyKey } from './owner-transaction-rules';

type Actor = { id: string; permissions: readonly string[] };

const detailInclude = {
  cash_account: {
    select: { id: true, name: true, kind: true, currency_code: true },
  },
  creator: { select: { id: true, name: true, username: true } },
  poster: { select: { id: true, name: true, username: true } },
  reverser: { select: { id: true, name: true, username: true } },
  journal_entry: { include: { lines: { include: { account: true } } } },
  reversal_journal_entry: {
    include: { lines: { include: { account: true } } },
  },
} satisfies Prisma.OwnerTransactionInclude;

@Injectable()
export class OwnerTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly currencies: CurrencyService,
    private readonly dates: DateRulesService,
    private readonly numbers: DocumentNumberService,
    private readonly ledger: LedgerService,
    private readonly operations: OperationService,
  ) {}

  create(
    actor: Actor,
    key: string | undefined,
    input: CreateOwnerTransactionDto,
  ) {
    return this.operations.execute({
      userId: actor.id,
      operationId: ownerTransactionIdempotencyKey(key),
      endpoint: '/admin/owner-transactions',
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        const dates = await this.ownerDates(actor, input);
        const cash = await tx.cashAccount.findUnique({
          where: { id: input.cash_account_id },
          include: { currency: true },
        });
        if (!cash) {
          throw notFound(
            'OWNER_TRANSACTION_CASH_ACCOUNT_NOT_FOUND',
            'Cash account not found',
          );
        }
        if (!cash.is_active) {
          throw conflict(
            'OWNER_TRANSACTION_CASH_ACCOUNT_INACTIVE',
            'Cash account is inactive',
          );
        }
        if (cash.currency_code !== input.currency_code) {
          throw invalid(
            'OWNER_TRANSACTION_CURRENCY_MISMATCH',
            'Cash-account currency must match the transaction currency',
          );
        }
        const amount = new Prisma.Decimal(input.amount);
        if (
          !amount.gt(0) ||
          amount.decimalPlaces() > cash.currency.display_precision
        ) {
          throw invalid(
            'OWNER_TRANSACTION_AMOUNT_INVALID',
            `Amount must be positive with at most ${cash.currency.display_precision} decimal places`,
          );
        }
        const rate = await this.currencies.requireRate(
          input.currency_code,
          exchangeRateCutoff(dates.documentDate),
        );
        const documentNumber = await this.numbers.issue(
          tx,
          'owner_transaction',
          'OWN',
          dates.accountingDate,
        );
        const document = await tx.ownerTransaction.create({
          data: {
            document_number: documentNumber,
            status: 'draft',
            kind: input.kind,
            cash_account_id: cash.id,
            currency_code: input.currency_code,
            amount_currency: amount,
            exchange_rate: rate,
            amount_iqd: amount.times(rate),
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            backdate_reason: dates.backdateReason,
            reason: input.reason.trim(),
            reference_number: input.reference_number?.trim(),
            created_by: actor.id,
          },
          include: detailInclude,
        });
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'owner_transaction.create',
          entityType: 'owner_transaction',
          entityId: document.id,
          after: this.auditShape(document),
        });
        return this.present(document);
      },
    });
  }

  post(
    actor: Actor,
    id: string,
    key: string | undefined,
    input: PostOwnerTransactionDto,
  ) {
    return this.operations.execute({
      userId: actor.id,
      operationId: ownerTransactionIdempotencyKey(key),
      endpoint: `/admin/owner-transactions/${id}/post`,
      payload: { id, ...input },
      work: async (tx) => {
        const document = await tx.ownerTransaction.findUnique({
          where: { id },
          include: { cash_account: { include: { ledger_account: true } } },
        });
        if (!document) {
          throw notFound(
            'OWNER_TRANSACTION_NOT_FOUND',
            'Owner transaction not found',
          );
        }
        if (document.status !== 'draft') {
          throw conflict(
            'OWNER_TRANSACTION_ALREADY_POSTED',
            'Only a draft owner transaction can be posted',
          );
        }
        if ((await separationOfDutiesLevel(tx)) === 'strict') {
          assertDifferentActor(
            actor.id,
            document.created_by,
            'A creator cannot post their own owner transaction in strict mode',
            'OWNER_TRANSACTION_SELF_APPROVAL_FORBIDDEN',
          );
        }
        await this.ownerDates(actor, {
          document_date: businessDateText(document.document_date),
          accounting_date: businessDateText(document.accounting_date),
          backdate_reason: document.backdate_reason ?? undefined,
        });
        if (!document.cash_account.is_active) {
          throw conflict(
            'OWNER_TRANSACTION_CASH_ACCOUNT_INACTIVE',
            'Cash account is inactive',
          );
        }
        const cashCode = document.cash_account.ledger_account.code;
        const journal = await this.ledger.post(tx, {
          sourceType: 'owner_transaction',
          sourceId: document.id,
          event: 'posted',
          documentDate: document.document_date,
          accountingDate: document.accounting_date,
          createdBy: actor.id,
          description: input.note?.trim() || document.reason,
          lines:
            document.kind === 'capital_deposit'
              ? [
                  this.line(cashCode, 'debit', document),
                  this.line('3000', 'credit', document),
                ]
              : [
                  this.line('3010', 'debit', document),
                  this.line(cashCode, 'credit', document),
                ],
        });
        const updated = await tx.ownerTransaction.update({
          where: { id },
          data: {
            status: 'posted',
            posted_by: actor.id,
            posted_at: new Date(),
            journal_entry_id: journal.id,
            updated_at: new Date(),
          },
          include: detailInclude,
        });
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'owner_transaction.post',
          entityType: 'owner_transaction',
          entityId: id,
          before: { status: 'draft' },
          after: { status: 'posted', journal_entry_id: journal.id },
        });
        return this.present(updated);
      },
    });
  }

  reverse(
    actor: Actor,
    id: string,
    key: string | undefined,
    input: ReverseOwnerTransactionDto,
  ) {
    return this.operations.execute({
      userId: actor.id,
      operationId: ownerTransactionIdempotencyKey(key),
      endpoint: `/admin/owner-transactions/${id}/reverse`,
      payload: { id, ...input },
      work: async (tx) => {
        const document = await tx.ownerTransaction.findUnique({
          where: { id },
          include: {
            journal_entry: {
              include: { lines: { include: { account: true } } },
            },
          },
        });
        if (!document) {
          throw notFound(
            'OWNER_TRANSACTION_NOT_FOUND',
            'Owner transaction not found',
          );
        }
        if (document.status !== 'posted' || !document.journal_entry) {
          throw conflict(
            'OWNER_TRANSACTION_INVALID_STATE',
            'Only a posted owner transaction can be reversed',
          );
        }
        if ((await separationOfDutiesLevel(tx)) === 'strict') {
          assertDifferentActor(
            actor.id,
            document.created_by,
            'A creator cannot reverse their own owner transaction in strict mode',
            'OWNER_TRANSACTION_SELF_APPROVAL_FORBIDDEN',
          );
        }
        const dates = await this.ownerDates(actor, input);
        const reversal = await this.ledger.post(tx, {
          sourceType: 'owner_transaction',
          sourceId: document.id,
          event: 'reversal',
          ...dates,
          createdBy: actor.id,
          description: input.reason.trim(),
          reversesId: document.journal_entry.id,
          lines: document.journal_entry.lines.map((line) => ({
            accountCode: line.account.code,
            side: line.debit_base.gt(0)
              ? ('credit' as const)
              : ('debit' as const),
            baseAmount: (line.debit_base.gt(0)
              ? line.debit_base
              : line.credit_base
            ).toString(),
            currencyCode: line.currency_code,
            originalAmount: line.original_amount.toString(),
            exchangeRate: line.exchange_rate.toString(),
          })),
        });
        const updated = await tx.ownerTransaction.update({
          where: { id },
          data: {
            status: 'reversed',
            reversed_by: actor.id,
            reversed_at: new Date(),
            reversal_reason: input.reason.trim(),
            reversal_journal_entry_id: reversal.id,
            updated_at: new Date(),
          },
          include: detailInclude,
        });
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'owner_transaction.reverse',
          entityType: 'owner_transaction',
          entityId: id,
          before: { status: 'posted' },
          after: { status: 'reversed', reversal_journal_entry_id: reversal.id },
          reason: input.reason.trim(),
        });
        return this.present(updated);
      },
    });
  }

  async get(id: string) {
    const row = await this.prisma.ownerTransaction.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!row)
      throw notFound(
        'OWNER_TRANSACTION_NOT_FOUND',
        'Owner transaction not found',
      );
    return this.present(row);
  }

  async list(query: OwnerTransactionQueryDto) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 25;
    const where: Prisma.OwnerTransactionWhereInput = {
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            accounting_date: {
              ...(query.from ? { gte: parseBusinessDate(query.from) } : {}),
              ...(query.to ? { lte: parseBusinessDate(query.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.ownerTransaction.findMany({
        where,
        include: detailInclude,
        orderBy: [{ accounting_date: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.ownerTransaction.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.present(row)),
      pagination: {
        page,
        per_page: perPage,
        total,
        pages: Math.ceil(total / perPage),
      },
    };
  }

  private async ownerDates(
    actor: Actor,
    input: {
      document_date: string;
      accounting_date?: string;
      backdate_reason?: string;
    },
  ) {
    try {
      return await this.dates.validate({
        documentDate: input.document_date,
        accountingDate: input.accounting_date,
        backdateReason: input.backdate_reason,
        permissions: actor.permissions,
      });
    } catch (error) {
      if (error instanceof HttpException) {
        const response = error.getResponse();
        const text =
          typeof response === 'string' ? response : JSON.stringify(response);
        if (
          text.includes('PERIOD_CLOSED') ||
          (text.toLowerCase().includes('period') &&
            text.toLowerCase().includes('closed'))
        ) {
          throw conflict(
            'OWNER_TRANSACTION_PERIOD_CLOSED',
            'The accounting period is closed',
          );
        }
        if (text.includes('backdate.approve') || text.includes('back-dated')) {
          throw forbidden(
            'OWNER_TRANSACTION_BACKDATE_WINDOW',
            'The transaction is outside the back-dating window',
          );
        }
      }
      throw error;
    }
  }

  private line(
    accountCode: string,
    side: 'debit' | 'credit',
    document: {
      amount_iqd: Prisma.Decimal;
      amount_currency: Prisma.Decimal;
      currency_code: string;
      exchange_rate: Prisma.Decimal;
    },
  ) {
    return {
      accountCode,
      side,
      baseAmount: document.amount_iqd.toString(),
      currencyCode: document.currency_code,
      originalAmount: document.amount_currency.toString(),
      exchangeRate: document.exchange_rate.toString(),
    };
  }

  private present(
    row: Prisma.OwnerTransactionGetPayload<{ include: typeof detailInclude }>,
  ) {
    return {
      id: row.id,
      document_number: row.document_number,
      status: row.status,
      kind: row.kind,
      cash_account: row.cash_account,
      currency_code: row.currency_code,
      amount_currency: row.amount_currency,
      exchange_rate: row.exchange_rate,
      amount_iqd: row.amount_iqd,
      document_date: row.document_date,
      accounting_date: row.accounting_date,
      backdate_reason: row.backdate_reason,
      reason: row.reason,
      reference_number: row.reference_number,
      created_by: row.created_by,
      posted_by: row.posted_by,
      posted_at: row.posted_at,
      reversed_by: row.reversed_by,
      reversed_at: row.reversed_at,
      reversal_reason: row.reversal_reason,
      created_at: row.created_at,
      updated_at: row.updated_at,
      creator: row.creator,
      poster: row.poster,
      reverser: row.reverser,
      journal_entry: row.journal_entry,
      reversal_journal_entry: row.reversal_journal_entry,
    };
  }

  private auditShape(row: {
    document_number: string;
    status: string;
    kind: string;
    cash_account_id: string;
    amount_currency: Prisma.Decimal;
    currency_code: string;
    amount_iqd: Prisma.Decimal;
  }): Prisma.InputJsonObject {
    return {
      document_number: row.document_number,
      status: row.status,
      kind: row.kind,
      cash_account_id: row.cash_account_id,
      amount_currency: row.amount_currency.toString(),
      currency_code: row.currency_code,
      amount_iqd: row.amount_iqd.toString(),
    };
  }
}
