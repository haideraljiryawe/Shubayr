import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CashTransferDto,
  CreateCashAccountDto,
  OpeningBalanceDto,
  UpdateCashAccountDto,
} from './dto/finance.dto';
import { CurrencyService } from './currency.service';
import { DateRulesService } from './date-rules.service';
import { DocumentNumberService } from './document-number.service';
import { LedgerService } from './ledger.service';
import { decimalPlaces } from './money';
import { OperationService } from './operation.service';

type Actor = { id: string; permissions: readonly string[] };

@Injectable()
export class CashAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly currencies: CurrencyService,
    private readonly dates: DateRulesService,
    private readonly ledger: LedgerService,
    private readonly numbers: DocumentNumberService,
    private readonly operations: OperationService,
  ) {}

  async list() {
    const accounts = await this.prisma.cashAccount.findMany({
      include: { currency: true, ledger_account: true },
      orderBy: [{ is_active: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    });
    return Promise.all(accounts.map((account) => this.present(account)));
  }

  async get(id: string) {
    const account = await this.prisma.cashAccount.findUnique({
      where: { id },
      include: { currency: true, ledger_account: true },
    });
    if (!account) throw new NotFoundException('Cash account not found');
    return this.present(account);
  }

  async getDocument(id: string) {
    const [opening, transfer] = await Promise.all([
      this.prisma.cashOpeningBalance.findUnique({
        where: { id },
        include: {
          cash_account: { select: { id: true, name: true, kind: true } },
        },
      }),
      this.prisma.cashTransfer.findUnique({
        where: { id },
        include: {
          from_account: { select: { id: true, name: true, kind: true } },
          to_account: { select: { id: true, name: true, kind: true } },
        },
      }),
    ]);
    if (opening) {
      return this.presentOpeningBalance(opening);
    }
    if (transfer) {
      return this.presentTransfer(transfer);
    }
    throw new NotFoundException('Financial document not found');
  }

  async create(actorId: string, input: CreateCashAccountDto) {
    const currency = await this.requireCurrency(input.currency_code);
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
    const account = await this.prisma.$transaction(async (tx) => {
      const ledgerAccount = await tx.ledgerAccount.create({
        data: {
          code: `CASH-${suffix}`,
          name_ar: input.name,
          name_en: input.name,
          type: 'asset',
          normal_side: 'debit',
          is_system: false,
        },
      });
      const account = await tx.cashAccount.create({
        data: {
          name: input.name,
          kind: input.kind,
          currency_code: currency.code,
          ledger_account_id: ledgerAccount.id,
        },
        include: { currency: true, ledger_account: true },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'cash_account.create',
        entityType: 'cash_account',
        entityId: account.id,
        after: {
          name: input.name,
          kind: input.kind,
          currency_code: input.currency_code,
        },
      });
      return account;
    });
    return this.present(account);
  }

  async update(actorId: string, id: string, input: UpdateCashAccountDto) {
    const existing = await this.prisma.cashAccount.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Cash account not found');
    const updated = await this.prisma.$transaction(async (tx) => {
      const account = await tx.cashAccount.update({
        where: { id },
        data: { ...input, updated_at: new Date() },
        include: { currency: true, ledger_account: true },
      });
      if (input.name) {
        await tx.ledgerAccount.update({
          where: { id: account.ledger_account_id },
          data: { name_ar: input.name, name_en: input.name },
        });
      }
      await this.audit.record(tx, {
        actorId,
        action: 'cash_account.update',
        entityType: 'cash_account',
        entityId: id,
        before: existing,
        after: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.is_active === undefined
            ? {}
            : { is_active: input.is_active }),
        },
      });
      return account;
    });
    return this.present(updated);
  }

  async remove(actorId: string, id: string) {
    const account = await this.prisma.cashAccount.findUnique({
      where: { id },
      include: { ledger_account: true },
    });
    if (!account) throw new NotFoundException('Cash account not found');
    const movements = await this.prisma.journalLine.count({
      where: { account_id: account.ledger_account_id },
    });
    if (movements > 0) {
      throw new ConflictException(
        'A cash account with movements must be disabled, not deleted',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.cashAccount.delete({ where: { id } });
      await tx.ledgerAccount.delete({
        where: { id: account.ledger_account_id },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'cash_account.delete',
        entityType: 'cash_account',
        entityId: id,
        before: {
          name: account.name,
          kind: account.kind,
          currency_code: account.currency_code,
        },
      });
    });
  }

  openingBalance(actor: Actor, accountId: string, input: OpeningBalanceDto) {
    return this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint: `/admin/cash-accounts/${accountId}/opening-balance`,
      payload: { accountId, ...input },
      responseStatus: 201,
      work: async (tx) => {
        const account = await tx.cashAccount.findUnique({
          where: { id: accountId },
          include: { currency: true, ledger_account: true },
        });
        if (!account) throw new NotFoundException('Cash account not found');
        if (!account.is_active)
          throw new ConflictException('Cash account is inactive');
        if (
          await tx.cashOpeningBalance.findFirst({
            where: { cash_account_id: accountId },
          })
        ) {
          throw new ConflictException('An opening balance already exists');
        }
        const dates = await this.dates.validate({
          documentDate: input.document_date,
          accountingDate: input.accounting_date,
          backdateReason: input.backdate_reason,
          permissions: actor.permissions,
        });
        const amount = this.validAmount(
          input.amount,
          account.currency.display_precision,
        );
        const rate = await this.currencies.requireRate(
          account.currency_code,
          dates.accountingDate,
        );
        const baseAmount = amount.times(rate);
        const base = await this.currencies.baseCurrency();
        const id = randomUUID();
        const journal = await this.ledger.post(tx, {
          sourceType: 'cash_opening_balance',
          sourceId: id,
          event: 'posted',
          ...dates,
          createdBy: actor.id,
          description: `Opening balance for ${account.name}`,
          lines: [
            {
              accountCode: account.ledger_account.code,
              side: 'debit',
              baseAmount: baseAmount.toString(),
              currencyCode: account.currency_code,
              originalAmount: amount.toString(),
              exchangeRate: rate.toString(),
            },
            {
              accountCode: '3000',
              side: 'credit',
              baseAmount: baseAmount.toString(),
              currencyCode: base.code,
              originalAmount: baseAmount.toString(),
              exchangeRate: '1',
            },
          ],
        });
        const documentNumber = await this.numbers.issue(
          tx,
          'cash_opening_balance',
          'OB',
          dates.accountingDate,
        );
        const document = await tx.cashOpeningBalance.create({
          data: {
            id,
            document_number: documentNumber,
            cash_account_id: accountId,
            amount,
            currency_code: account.currency_code,
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            backdate_reason: dates.backdateReason,
            created_by: actor.id,
            journal_entry_id: journal.id,
          },
          include: {
            cash_account: { select: { id: true, name: true, kind: true } },
          },
        });
        return this.presentOpeningBalance(document);
      },
    });
  }

  transfer(actor: Actor, input: CashTransferDto) {
    return this.operations.execute({
      userId: actor.id,
      operationId: input.operation_id,
      endpoint: '/admin/cash-transfers',
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        if (input.from_account_id === input.to_account_id) {
          throw new UnprocessableEntityException(
            'Transfer accounts must differ',
          );
        }
        const accounts = await tx.cashAccount.findMany({
          where: { id: { in: [input.from_account_id, input.to_account_id] } },
          include: { currency: true, ledger_account: true },
        });
        const from = accounts.find((item) => item.id === input.from_account_id);
        const to = accounts.find((item) => item.id === input.to_account_id);
        if (!from || !to) throw new NotFoundException('Cash account not found');
        if (!from.is_active || !to.is_active)
          throw new ConflictException('Cash account is inactive');
        if (from.currency_code !== to.currency_code) {
          throw new UnprocessableEntityException(
            'Cross-currency transfers require an exchange document',
          );
        }
        const dates = await this.dates.validate({
          documentDate: input.document_date,
          accountingDate: input.accounting_date,
          backdateReason: input.backdate_reason,
          permissions: actor.permissions,
        });
        const amount = this.validAmount(
          input.amount,
          from.currency.display_precision,
        );
        const rate = await this.currencies.requireRate(
          from.currency_code,
          dates.accountingDate,
        );
        const baseAmount = amount.times(rate);
        const id = randomUUID();
        const journal = await this.ledger.post(tx, {
          sourceType: 'cash_transfer',
          sourceId: id,
          event: 'posted',
          ...dates,
          createdBy: actor.id,
          description: input.reason,
          lines: [
            {
              accountCode: to.ledger_account.code,
              side: 'debit',
              baseAmount: baseAmount.toString(),
              currencyCode: to.currency_code,
              originalAmount: amount.toString(),
              exchangeRate: rate.toString(),
            },
            {
              accountCode: from.ledger_account.code,
              side: 'credit',
              baseAmount: baseAmount.toString(),
              currencyCode: from.currency_code,
              originalAmount: amount.toString(),
              exchangeRate: rate.toString(),
            },
          ],
        });
        const documentNumber = await this.numbers.issue(
          tx,
          'cash_transfer',
          'TR',
          dates.accountingDate,
        );
        const document = await tx.cashTransfer.create({
          data: {
            id,
            document_number: documentNumber,
            from_account_id: from.id,
            to_account_id: to.id,
            amount,
            currency_code: from.currency_code,
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            backdate_reason: dates.backdateReason,
            reason: input.reason,
            created_by: actor.id,
            journal_entry_id: journal.id,
          },
          include: {
            from_account: { select: { id: true, name: true, kind: true } },
            to_account: { select: { id: true, name: true, kind: true } },
          },
        });
        return this.presentTransfer(document);
      },
    });
  }

  private async present(account: {
    currency_code: string;
    currency: { display_precision: number };
    ledger_account: { id: string; code: string };
    [key: string]: unknown;
  }) {
    const [base, lines] = await Promise.all([
      this.ledger.accountBalance(account.ledger_account.code),
      this.prisma.journalLine.findMany({
        where: {
          account_id: account.ledger_account.id,
          currency_code: account.currency_code,
        },
        select: {
          debit_base: true,
          original_amount: true,
        },
      }),
    ]);
    const original = lines.reduce(
      (sum, line) =>
        line.debit_base.gt(0)
          ? sum.plus(line.original_amount)
          : sum.minus(line.original_amount),
      new Prisma.Decimal(0),
    );
    return {
      ...account,
      balance: original.toFixed(account.currency.display_precision),
      base_balance: base.balance,
      base_currency_code: base.currency_code,
    };
  }

  private async requireCurrency(code: string) {
    const currency = await this.prisma.currency.findUnique({ where: { code } });
    if (!currency?.enabled)
      throw new UnprocessableEntityException('Currency is not enabled');
    return currency;
  }

  private presentOpeningBalance(document: {
    id: string;
    document_number: string;
    amount: Prisma.Decimal;
    currency_code: string;
    document_date: Date;
    accounting_date: Date;
    backdate_reason: string | null;
    created_by: string;
    journal_entry_id: string;
    created_at: Date;
    cash_account: { id: string; name: string; kind: string };
  }) {
    return {
      document_type: 'cash_opening_balance' as const,
      id: document.id,
      document_number: document.document_number,
      amount: document.amount,
      currency_code: document.currency_code,
      document_date: document.document_date,
      accounting_date: document.accounting_date,
      backdate_reason: document.backdate_reason,
      created_by: document.created_by,
      journal_entry_id: document.journal_entry_id,
      created_at: document.created_at,
      cash_account: document.cash_account,
    };
  }

  private presentTransfer(document: {
    id: string;
    document_number: string;
    amount: Prisma.Decimal;
    currency_code: string;
    document_date: Date;
    accounting_date: Date;
    backdate_reason: string | null;
    reason: string;
    created_by: string;
    journal_entry_id: string;
    created_at: Date;
    from_account: { id: string; name: string; kind: string };
    to_account: { id: string; name: string; kind: string };
  }) {
    return {
      document_type: 'cash_transfer' as const,
      id: document.id,
      document_number: document.document_number,
      amount: document.amount,
      currency_code: document.currency_code,
      document_date: document.document_date,
      accounting_date: document.accounting_date,
      backdate_reason: document.backdate_reason,
      reason: document.reason,
      created_by: document.created_by,
      journal_entry_id: document.journal_entry_id,
      created_at: document.created_at,
      from_account: document.from_account,
      to_account: document.to_account,
    };
  }

  private validAmount(value: string, precision: number): Prisma.Decimal {
    const amount = new Prisma.Decimal(value);
    if (!amount.gt(0))
      throw new UnprocessableEntityException('Amount must be positive');
    if (decimalPlaces(value) > precision) {
      throw new UnprocessableEntityException(
        `Amount exceeds currency precision of ${precision}`,
      );
    }
    return amount;
  }
}
