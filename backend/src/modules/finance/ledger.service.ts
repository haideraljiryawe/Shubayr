import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { businessDate } from './business-date';
import { DateRulesService } from './date-rules.service';
import { DocumentNumberService } from './document-number.service';
import { LedgerQueryDto } from './dto/finance.dto';

export type PostingLine = {
  accountCode: string;
  side: 'debit' | 'credit';
  baseAmount: string;
  currencyCode: string;
  originalAmount: string;
  exchangeRate: string;
  memo?: string;
};

export type PostingInput = {
  sourceType: string;
  sourceId: string;
  event: string;
  documentDate: Date;
  accountingDate: Date;
  createdBy: string;
  description?: string;
  reversesId?: string;
  lines: PostingLine[];
};

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: DocumentNumberService,
    private readonly dates: DateRulesService,
  ) {}

  async post(tx: Prisma.TransactionClient, input: PostingInput) {
    const existing = await tx.journalEntry.findUnique({
      where: {
        source_type_source_id_event: {
          source_type: input.sourceType,
          source_id: input.sourceId,
          event: input.event,
        },
      },
      include: { lines: { include: { account: true } } },
    });
    if (existing) return this.presentEntry(existing);
    const period = input.accountingDate.toISOString().slice(0, 7);
    await tx.$queryRaw<Array<{ locked: string }>>(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`period:${period}`}))::text AS locked`,
    );
    await this.dates.assertOpen(tx, input.accountingDate);
    if (input.lines.length < 2) {
      throw new UnprocessableEntityException(
        'A journal entry requires at least two lines',
      );
    }
    const accounts = await tx.ledgerAccount.findMany({
      where: {
        code: { in: [...new Set(input.lines.map((line) => line.accountCode))] },
      },
    });
    const accountIds = new Map(
      accounts.map((account) => [account.code, account.id]),
    );
    if (
      accountIds.size !==
      new Set(input.lines.map((line) => line.accountCode)).size
    ) {
      throw new UnprocessableEntityException('A ledger account does not exist');
    }
    const currencies = await tx.currency.findMany({
      where: {
        code: {
          in: [...new Set(input.lines.map((line) => line.currencyCode))],
        },
      },
    });
    const currencyMap = new Map(
      currencies.map((currency) => [currency.code, currency]),
    );
    const base =
      currencies.find((currency) => currency.is_base) ??
      (await tx.currency.findFirst({ where: { is_base: true } }));
    if (!base) throw new ConflictException('No base currency is configured');

    let debits = new Prisma.Decimal(0);
    let credits = new Prisma.Decimal(0);
    const lines = input.lines.map((line) => {
      const baseAmount = new Prisma.Decimal(line.baseAmount);
      const originalAmount = new Prisma.Decimal(line.originalAmount);
      const exchangeRate = new Prisma.Decimal(line.exchangeRate);
      if (!baseAmount.gt(0) || !originalAmount.gt(0) || !exchangeRate.gt(0)) {
        throw new UnprocessableEntityException(
          'Journal amounts and rates must be positive',
        );
      }
      const currency = currencyMap.get(line.currencyCode);
      if (!currency?.enabled) {
        throw new UnprocessableEntityException(
          `Currency ${line.currencyCode} is not enabled`,
        );
      }
      if (line.currencyCode === base.code && !exchangeRate.equals(1)) {
        throw new UnprocessableEntityException(
          'The base currency exchange rate must be exactly 1',
        );
      }
      if (line.side === 'debit') debits = debits.plus(baseAmount);
      else credits = credits.plus(baseAmount);
      return {
        account_id: accountIds.get(line.accountCode)!,
        debit_base: line.side === 'debit' ? baseAmount : new Prisma.Decimal(0),
        credit_base:
          line.side === 'credit' ? baseAmount : new Prisma.Decimal(0),
        currency_code: line.currencyCode,
        original_amount: originalAmount,
        exchange_rate: exchangeRate,
        memo: line.memo,
      };
    });
    if (!debits.equals(credits)) {
      throw new UnprocessableEntityException(
        `Journal is unbalanced: debits ${debits.toString()} credits ${credits.toString()}`,
      );
    }
    const documentNumber = await this.numbers.issue(
      tx,
      'journal_entry',
      'JRN',
      input.accountingDate,
    );
    const entry = await tx.journalEntry.create({
      data: {
        document_number: documentNumber,
        source_type: input.sourceType,
        source_id: input.sourceId,
        event: input.event,
        document_date: input.documentDate,
        accounting_date: input.accountingDate,
        description: input.description,
        created_by: input.createdBy,
        reverses_id: input.reversesId,
        lines: { create: lines },
      },
      include: { lines: { include: { account: true } } },
    });
    return this.presentEntry(entry);
  }

  async reverse(entryId: string, actorId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const original = await tx.journalEntry.findUnique({
        where: { id: entryId },
        include: { lines: { include: { account: true } } },
      });
      if (!original) throw new NotFoundException('Journal entry not found');
      const existing = await tx.journalEntry.findUnique({
        where: { reverses_id: original.id },
        include: { lines: { include: { account: true } } },
      });
      if (existing) return this.presentEntry(existing);
      const reversalDate = businessDate();
      return this.post(tx, {
        sourceType: 'journal_reversal',
        sourceId: original.id,
        event: 'reversal',
        documentDate: reversalDate,
        accountingDate: reversalDate,
        createdBy: actorId,
        description: reason,
        reversesId: original.id,
        lines: original.lines.map((line) => ({
          accountCode: line.account.code,
          side: line.debit_base.gt(0) ? 'credit' : 'debit',
          baseAmount: line.debit_base.gt(0)
            ? line.debit_base.toString()
            : line.credit_base.toString(),
          currencyCode: line.currency_code,
          originalAmount: line.original_amount.toString(),
          exchangeRate: line.exchange_rate.toString(),
          memo: `Reversal of ${original.document_number}`,
        })),
      });
    });
  }

  async accountBalance(code: string, asOf?: string) {
    const account = await this.prisma.ledgerAccount.findUnique({
      where: { code },
    });
    if (!account) throw new NotFoundException('Ledger account not found');
    const aggregate = await this.prisma.journalLine.aggregate({
      where: {
        account_id: account.id,
        ...(asOf
          ? {
              entry: {
                accounting_date: { lte: new Date(`${asOf}T00:00:00Z`) },
              },
            }
          : {}),
      },
      _sum: { debit_base: true, credit_base: true },
    });
    const debit = aggregate._sum.debit_base ?? new Prisma.Decimal(0);
    const credit = aggregate._sum.credit_base ?? new Prisma.Decimal(0);
    const balance =
      account.normal_side === 'credit'
        ? credit.minus(debit)
        : debit.minus(credit);
    return {
      account,
      as_of: asOf ?? null,
      debit: debit.toFixed(4),
      credit: credit.toFixed(4),
      balance: balance.toFixed(4),
      currency_code: (await this.baseCurrency()).code,
    };
  }

  async entries(query: LedgerQueryDto) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const where: Prisma.JournalEntryWhereInput = {
      ...(query.account_code
        ? { lines: { some: { account: { code: query.account_code } } } }
        : {}),
      ...(query.source_type ? { source_type: query.source_type } : {}),
      ...(query.source_id ? { source_id: query.source_id } : {}),
      ...(query.from || query.to
        ? {
            accounting_date: {
              ...(query.from
                ? { gte: new Date(`${query.from}T00:00:00Z`) }
                : {}),
              ...(query.to ? { lte: new Date(`${query.to}T00:00:00Z`) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        include: { lines: { include: { account: true } } },
        orderBy: [{ accounting_date: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return {
      page,
      per_page: perPage,
      total,
      data: rows.map((row) => this.presentEntry(row)),
    };
  }

  async get(entryId: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: {
        lines: { include: { account: true } },
        reverses: { select: { id: true, document_number: true } },
        reversals: {
          select: { id: true, document_number: true },
          orderBy: { posted_at: 'asc' },
        },
      },
    });
    if (!entry) throw new NotFoundException('Journal entry not found');
    return this.presentEntry(entry);
  }

  async trialBalance(asOf?: string) {
    const accounts = await this.prisma.ledgerAccount.findMany({
      where: { enabled: true },
      include: {
        journal_lines: {
          where: asOf
            ? {
                entry: {
                  accounting_date: { lte: new Date(`${asOf}T00:00:00Z`) },
                },
              }
            : undefined,
          select: { debit_base: true, credit_base: true },
        },
      },
      orderBy: { code: 'asc' },
    });
    let debitTotal = new Prisma.Decimal(0);
    let creditTotal = new Prisma.Decimal(0);
    const data = accounts.map(({ journal_lines, ...account }) => {
      const debit = journal_lines.reduce(
        (sum, line) => sum.plus(line.debit_base),
        new Prisma.Decimal(0),
      );
      const credit = journal_lines.reduce(
        (sum, line) => sum.plus(line.credit_base),
        new Prisma.Decimal(0),
      );
      debitTotal = debitTotal.plus(debit);
      creditTotal = creditTotal.plus(credit);
      return {
        ...account,
        debit: debit.toFixed(4),
        credit: credit.toFixed(4),
        balance:
          account.normal_side === 'credit'
            ? credit.minus(debit).toFixed(4)
            : debit.minus(credit).toFixed(4),
      };
    });
    return {
      as_of: asOf ?? null,
      currency_code: (await this.baseCurrency()).code,
      debit_total: debitTotal.toFixed(4),
      credit_total: creditTotal.toFixed(4),
      balanced: debitTotal.equals(creditTotal),
      data,
    };
  }

  private baseCurrency() {
    return this.prisma.currency.findFirstOrThrow({ where: { is_base: true } });
  }

  private presentEntry<T extends { lines: Array<{ account: unknown }> }>(
    entry: T,
  ) {
    return {
      ...entry,
      lines: entry.lines.map((line) => {
        const value = line as typeof line & {
          debit_base: Prisma.Decimal;
          credit_base: Prisma.Decimal;
          original_amount: Prisma.Decimal;
          exchange_rate: Prisma.Decimal;
        };
        return {
          ...value,
          debit_base: value.debit_base.toFixed(4),
          credit_base: value.credit_base.toFixed(4),
          original_amount: value.original_amount.toFixed(6),
          exchange_rate: value.exchange_rate.toFixed(10),
        };
      }),
    };
  }
}
