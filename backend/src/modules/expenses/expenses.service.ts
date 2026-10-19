import { InjectQueue } from '@nestjs/bullmq';
import { HttpException, Injectable, Optional } from '@nestjs/common';
import type { Queue } from 'bullmq';
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
import { CurrencyService } from '../finance/currency.service';
import {
  DateRulesService,
  type DateRuleInput,
} from '../finance/date-rules.service';
import { DocumentNumberService } from '../finance/document-number.service';
import { LedgerService } from '../finance/ledger.service';
import { OperationService } from '../finance/operation.service';
import {
  businessDateText,
  exchangeRateCutoff,
  parseBusinessDate,
} from '../finance/business-date';
import { MediaService, type UploadedImage } from '../media/media.service';
import {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  CancelPrepaidScheduleDto,
  ExpenseFormOptionsQueryDto,
  ExpenseQueryDto,
  PayExpenseDto,
  PostExpenseDto,
  ReverseExpenseDto,
  UpdateExpenseCategoryDto,
  UpdateExpenseDto,
} from './dto/expenses.dto';
import {
  expenseIdempotencyKey,
  expensePostingLines,
  monthlyBusinessDates,
  splitScheduleAmount,
} from './expense-rules';

type Actor = { id: string; permissions: readonly string[] };
type JournalWithLines = Prisma.JournalEntryGetPayload<{
  include: { lines: { include: { account: true } } };
}>;

const detailInclude = {
  category: { include: { ledger_account: true } },
  currency: true,
  cash_account: { include: { ledger_account: true } },
  supplier: { select: { id: true, name: true } },
  receipt: {
    select: { id: true, public_url: true, mime_type: true, size_bytes: true },
  },
  creator: { select: { id: true, name: true, username: true } },
  poster: { select: { id: true, name: true, username: true } },
  journal_entry: {
    include: { lines: { include: { account: true } } },
  },
  payments: {
    include: {
      cash_account: { select: { id: true, name: true, kind: true } },
      creator: { select: { id: true, name: true, username: true } },
      journal_entry: { include: { lines: { include: { account: true } } } },
    },
    orderBy: [{ created_at: 'asc' as const }, { id: 'asc' as const }],
  },
  corrections: {
    include: {
      creator: { select: { id: true, name: true, username: true } },
      postings: {
        include: {
          reversal_journal_entry: {
            include: { lines: { include: { account: true } } },
          },
        },
        orderBy: { role: 'asc' as const },
      },
    },
  },
  schedule: {
    include: {
      creator: { select: { id: true, name: true, username: true } },
      canceller: { select: { id: true, name: true, username: true } },
      cancellation_journal_entry: {
        include: { lines: { include: { account: true } } },
      },
      installments: {
        include: {
          journal_entry: {
            include: { lines: { include: { account: true } } },
          },
        },
        orderBy: { sequence: 'asc' as const },
      },
    },
  },
} satisfies Prisma.ExpenseInclude;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly currencies: CurrencyService,
    private readonly dates: DateRulesService,
    private readonly numbers: DocumentNumberService,
    private readonly ledger: LedgerService,
    private readonly operations: OperationService,
    private readonly media: MediaService,
    @Optional()
    @InjectQueue('expense-schedules')
    private readonly scheduleQueue?: Queue,
  ) {}

  async listCategories() {
    const categories = await this.prisma.expenseCategory.findMany({
      include: { ledger_account: true, _count: { select: { expenses: true } } },
      orderBy: [{ is_active: 'desc' }, { name_en: 'asc' }, { id: 'asc' }],
    });
    return categories.map((category) => this.presentCategory(category));
  }

  listExpenseLedgerAccounts() {
    return this.prisma.ledgerAccount.findMany({
      where: { type: 'expense', enabled: true },
      select: {
        id: true,
        code: true,
        name_ar: true,
        name_en: true,
      },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
  }

  async formOptions(query: ExpenseFormOptionsQueryDto) {
    const base = await this.currencies.baseCurrency();
    const currencyCode = query.currency_code ?? base.code;
    const documentDateText = query.document_date ?? businessDateText();
    const documentDate = parseBusinessDate(documentDateText);
    const [categories, currencies, cashAccounts, suppliers, setting, rate] =
      await Promise.all([
        this.prisma.expenseCategory.findMany({
          where: { is_active: true },
          select: { id: true, name_ar: true, name_en: true },
          orderBy: [{ name_en: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.currency.findMany({
          where: { enabled: true },
          select: {
            code: true,
            name_ar: true,
            name_en: true,
            symbol: true,
            display_precision: true,
            is_base: true,
          },
          orderBy: { code: 'asc' },
        }),
        this.prisma.cashAccount.findMany({
          where: { is_active: true, currency_code: currencyCode },
          select: { id: true, name: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.supplier.findMany({
          where: { is_active: true },
          select: { id: true, name: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.storeSetting.findUnique({
          where: { key: 'backdating_window_days' },
          select: { value: true },
        }),
        this.currencies.applicable(
          currencyCode,
          exchangeRateCutoff(documentDate),
        ),
      ]);
    return {
      categories,
      currencies,
      cash_accounts: cashAccounts,
      suppliers,
      rate_preview: {
        currency_code: rate.currency_code,
        base_currency_code: rate.base_currency_code,
        rate: rate.rate,
        effective_at: rate.effective_at,
        not_from_today: rate.not_from_today,
      },
      backdating_window_days: Number(setting?.value ?? '90'),
    };
  }

  async createCategory(actorId: string, input: CreateExpenseCategoryDto) {
    return this.prisma.$transaction(async (tx) => {
      const account = input.ledger_account_id
        ? await this.requireExpenseAccount(tx, input.ledger_account_id)
        : await tx.ledgerAccount.create({
            data: {
              code: `EXP-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`,
              name_ar: input.name_ar.trim(),
              name_en: input.name_en.trim(),
              type: 'expense',
              normal_side: 'debit',
              is_system: false,
            },
          });
      const category = await tx.expenseCategory.create({
        data: {
          code: `custom-${randomUUID().slice(0, 12)}`,
          name_ar: input.name_ar.trim(),
          name_en: input.name_en.trim(),
          ledger_account_id: account.id,
        },
        include: {
          ledger_account: true,
          _count: { select: { expenses: true } },
        },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'expense_category.create',
        entityType: 'expense_category',
        entityId: category.id,
        after: {
          name_ar: category.name_ar,
          name_en: category.name_en,
          ledger_account_id: category.ledger_account_id,
          is_active: category.is_active,
        },
      });
      return this.presentCategory(category);
    });
  }

  async updateCategory(
    actorId: string,
    id: string,
    input: UpdateExpenseCategoryDto,
  ) {
    const existing = await this.prisma.expenseCategory.findUnique({
      where: { id },
    });
    if (!existing)
      throw notFound(
        'EXPENSE_CATEGORY_NOT_FOUND',
        'Expense category not found',
      );
    if (
      input.ledger_account_id &&
      input.ledger_account_id !== existing.ledger_account_id
    ) {
      if (await this.prisma.expense.count({ where: { category_id: id } })) {
        throw conflict(
          'EXPENSE_CATEGORY_IN_USE',
          'The ledger mapping of a category in use cannot be changed',
        );
      }
    }
    return this.prisma.$transaction(async (tx) => {
      if (input.ledger_account_id) {
        await this.requireExpenseAccount(tx, input.ledger_account_id);
      }
      const category = await tx.expenseCategory.update({
        where: { id },
        data: {
          ...(input.name_ar === undefined
            ? {}
            : { name_ar: input.name_ar.trim() }),
          ...(input.name_en === undefined
            ? {}
            : { name_en: input.name_en.trim() }),
          ...(input.ledger_account_id === undefined
            ? {}
            : { ledger_account_id: input.ledger_account_id }),
          ...(input.is_active === undefined
            ? {}
            : { is_active: input.is_active }),
          updated_at: new Date(),
        },
        include: {
          ledger_account: true,
          _count: { select: { expenses: true } },
        },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'expense_category.update',
        entityType: 'expense_category',
        entityId: id,
        before: {
          name_ar: existing.name_ar,
          name_en: existing.name_en,
          ledger_account_id: existing.ledger_account_id,
          is_active: existing.is_active,
        },
        after: {
          name_ar: category.name_ar,
          name_en: category.name_en,
          ledger_account_id: category.ledger_account_id,
          is_active: category.is_active,
        },
      });
      return this.presentCategory(category);
    });
  }

  async removeCategory(actorId: string, id: string): Promise<void> {
    const category = await this.prisma.expenseCategory.findUnique({
      where: { id },
      include: { _count: { select: { expenses: true } }, ledger_account: true },
    });
    if (!category)
      throw notFound(
        'EXPENSE_CATEGORY_NOT_FOUND',
        'Expense category not found',
      );
    if (category._count.expenses) {
      throw conflict(
        'EXPENSE_CATEGORY_IN_USE',
        'A category in use can be deactivated but not deleted',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.expenseCategory.delete({ where: { id } });
      if (!category.ledger_account.is_system) {
        const lines = await tx.journalLine.count({
          where: { account_id: category.ledger_account_id },
        });
        if (!lines)
          await tx.ledgerAccount.delete({
            where: { id: category.ledger_account_id },
          });
      }
      await this.audit.record(tx, {
        actorId,
        action: 'expense_category.delete',
        entityType: 'expense_category',
        entityId: id,
        before: { name_ar: category.name_ar, name_en: category.name_en },
      });
    });
  }

  async uploadReceipt(actorId: string, file: UploadedImage | undefined) {
    const receipt = await this.media.uploadExpenseReceipt(file, actorId);
    await this.prisma.$transaction((tx) =>
      this.audit.record(tx, {
        actorId,
        action: 'expense_receipt.upload',
        entityType: 'media_object',
        entityId: receipt.id,
        after: {
          mime_type: receipt.mime_type,
          size_bytes: receipt.size_bytes,
          checksum: receipt.checksum,
        },
      }),
    );
    return receipt;
  }

  downloadReceipt(id: string) {
    return this.media.downloadExpenseReceipt(id);
  }

  create(actor: Actor, key: string | undefined, input: CreateExpenseDto) {
    const operationId = expenseIdempotencyKey(key);
    return this.operations.execute({
      userId: actor.id,
      operationId,
      endpoint: '/admin/expenses',
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        const dates = await this.expenseDates({
          documentDate: input.document_date,
          accountingDate: input.accounting_date,
          backdateReason: input.backdate_reason,
          permissions: actor.permissions,
        });
        const category = await tx.expenseCategory.findUnique({
          where: { id: input.category_id },
        });
        if (!category)
          throw notFound(
            'EXPENSE_CATEGORY_NOT_FOUND',
            'Expense category not found',
          );
        if (!category.is_active) {
          throw conflict(
            'EXPENSE_CATEGORY_INACTIVE',
            'Expense category is inactive',
          );
        }
        const currency = await tx.currency.findUnique({
          where: { code: input.currency_code },
        });
        if (!currency?.enabled) {
          throw invalid(
            'EXPENSE_CURRENCY_DISABLED',
            'Expense currency is not enabled',
          );
        }
        const amount = new Prisma.Decimal(input.amount);
        if (!amount.gt(0))
          throw invalid(
            'EXPENSE_AMOUNT_INVALID',
            'Expense amount must be positive',
          );
        if (amount.decimalPlaces() > currency.display_precision) {
          throw invalid(
            'EXPENSE_AMOUNT_PRECISION',
            `Expense amount exceeds ${currency.display_precision} decimal places for ${currency.code}`,
          );
        }
        if (!input.supplier_id && !input.payee?.trim()) {
          throw invalid(
            'EXPENSE_PAYEE_REQUIRED',
            'A payee or supplier is required',
          );
        }
        if (input.supplier_id) {
          const supplier = await tx.supplier.findUnique({
            where: { id: input.supplier_id },
          });
          if (!supplier)
            throw notFound('EXPENSE_SUPPLIER_NOT_FOUND', 'Supplier not found');
        }
        const recognitionMode = input.recognition_mode ?? 'immediate';
        this.validateRecognition(
          recognitionMode,
          input.payment_mode,
          input.prepaid_schedule,
        );
        const cash = await this.validateCashAccount(
          tx,
          input.payment_mode,
          input.cash_account_id,
          input.currency_code,
        );
        if (input.receipt_media_id)
          await this.media.requireExpenseReceipt(input.receipt_media_id);
        const rate = await this.currencies.requireRate(
          input.currency_code,
          dates.documentDate,
        );
        const amountIqd = amount.times(rate);
        const documentNumber = await this.numbers.issue(
          tx,
          'expense',
          'EXP',
          dates.documentDate,
        );
        const expense = await tx.expense.create({
          data: {
            document_number: documentNumber,
            category_id: category.id,
            amount_currency: amount,
            currency_code: input.currency_code,
            exchange_rate: rate,
            amount_iqd: amountIqd,
            paid_currency: new Prisma.Decimal(0),
            balance_currency: amount,
            payment_mode: input.payment_mode,
            recognition_mode: recognitionMode,
            cash_account_id: cash?.id,
            supplier_id: input.supplier_id,
            payee: input.payee?.trim(),
            description: input.description.trim(),
            reference_number: input.reference_number?.trim(),
            receipt_media_id: input.receipt_media_id,
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            backdate_reason: dates.backdateReason,
            created_by: actor.id,
          },
          include: detailInclude,
        });
        if (recognitionMode === 'prepaid') {
          await this.createSchedule(
            tx,
            expense.id,
            actor.id,
            amountIqd,
            input.prepaid_schedule!,
          );
        }
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'expense.create',
          entityType: 'expense',
          entityId: expense.id,
          after: this.auditExpense(expense),
        });
        return this.getWith(tx, expense.id);
      },
    });
  }

  async updateDraft(actor: Actor, id: string, input: UpdateExpenseDto) {
    if (!Object.keys(input).length) {
      throw invalid('EXPENSE_UPDATE_EMPTY', 'At least one field is required');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM expenses WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.expense.findUnique({
        where: { id },
        include: detailInclude,
      });
      if (!current) throw notFound('EXPENSE_NOT_FOUND', 'Expense not found');
      if (current.status !== 'draft') {
        throw conflict(
          'EXPENSE_ALREADY_POSTED',
          'Posted expenses are immutable; use a correction',
        );
      }

      const categoryId = input.category_id ?? current.category_id;
      const currencyCode = input.currency_code ?? current.currency_code;
      const paymentMode = input.payment_mode ?? current.payment_mode;
      const recognitionMode =
        input.recognition_mode ?? current.recognition_mode;
      const currentSchedule = current.schedule
        ? {
            start_date: businessDateText(current.schedule.start_date),
            periods: current.schedule.periods,
          }
        : undefined;
      const scheduleInput =
        input.prepaid_schedule === null
          ? undefined
          : (input.prepaid_schedule ?? currentSchedule);
      this.validateRecognition(
        recognitionMode as 'immediate' | 'prepaid',
        paymentMode as 'paid_now' | 'owed',
        scheduleInput,
      );
      const cashAccountId =
        input.cash_account_id === undefined
          ? current.cash_account_id
          : input.cash_account_id;
      const supplierId =
        input.supplier_id === undefined
          ? current.supplier_id
          : input.supplier_id;
      const payee =
        input.payee === undefined ? current.payee : input.payee?.trim() || null;
      const receiptId =
        input.receipt_media_id === undefined
          ? current.receipt_media_id
          : input.receipt_media_id;
      const dates = await this.expenseDates({
        documentDate:
          input.document_date ?? businessDateText(current.document_date),
        accountingDate:
          input.accounting_date ?? businessDateText(current.accounting_date),
        backdateReason:
          input.backdate_reason === undefined
            ? (current.backdate_reason ?? undefined)
            : (input.backdate_reason ?? undefined),
        permissions: actor.permissions,
      });
      const category = await tx.expenseCategory.findUnique({
        where: { id: categoryId },
      });
      if (!category) {
        throw notFound(
          'EXPENSE_CATEGORY_NOT_FOUND',
          'Expense category not found',
        );
      }
      if (!category.is_active) {
        throw conflict(
          'EXPENSE_CATEGORY_INACTIVE',
          'Expense category is inactive',
        );
      }
      const currency = await tx.currency.findUnique({
        where: { code: currencyCode },
      });
      if (!currency?.enabled) {
        throw invalid(
          'EXPENSE_CURRENCY_DISABLED',
          'Expense currency is not enabled',
        );
      }
      const amount = new Prisma.Decimal(
        input.amount ?? current.amount_currency.toString(),
      );
      if (!amount.gt(0)) {
        throw invalid(
          'EXPENSE_AMOUNT_INVALID',
          'Expense amount must be positive',
        );
      }
      if (amount.decimalPlaces() > currency.display_precision) {
        throw invalid(
          'EXPENSE_AMOUNT_PRECISION',
          `Expense amount exceeds ${currency.display_precision} decimal places for ${currency.code}`,
        );
      }
      if (!supplierId && !payee) {
        throw invalid(
          'EXPENSE_PAYEE_REQUIRED',
          'A payee or supplier is required',
        );
      }
      if (supplierId) {
        const supplier = await tx.supplier.findUnique({
          where: { id: supplierId },
        });
        if (!supplier) {
          throw notFound('EXPENSE_SUPPLIER_NOT_FOUND', 'Supplier not found');
        }
      }
      const cash = await this.validateCashAccount(
        tx,
        paymentMode as 'paid_now' | 'owed',
        cashAccountId ?? undefined,
        currencyCode,
      );
      if (receiptId) await this.media.requireExpenseReceipt(receiptId);
      const rate = await this.currencies.requireRate(
        currencyCode,
        dates.documentDate,
      );
      const updated = await tx.expense.update({
        where: { id },
        data: {
          category_id: categoryId,
          amount_currency: amount,
          currency_code: currencyCode,
          exchange_rate: rate,
          amount_iqd: amount.times(rate),
          paid_currency: new Prisma.Decimal(0),
          balance_currency: amount,
          payment_mode: paymentMode,
          recognition_mode: recognitionMode,
          cash_account_id: cash?.id ?? null,
          supplier_id: supplierId,
          payee,
          description: input.description?.trim() ?? current.description,
          reference_number:
            input.reference_number === undefined
              ? current.reference_number
              : input.reference_number?.trim() || null,
          receipt_media_id: receiptId,
          document_date: dates.documentDate,
          accounting_date: dates.accountingDate,
          backdate_reason: dates.backdateReason,
          updated_at: new Date(),
        },
        include: detailInclude,
      });
      if (current.schedule) {
        await tx.expenseScheduleInstallment.deleteMany({
          where: { schedule_id: current.schedule.id },
        });
        await tx.expenseSchedule.delete({ where: { id: current.schedule.id } });
      }
      if (recognitionMode === 'prepaid') {
        await this.createSchedule(
          tx,
          id,
          actor.id,
          amount.times(rate),
          scheduleInput!,
        );
      }
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'expense.update',
        entityType: 'expense',
        entityId: id,
        before: this.auditExpense(current),
        after: this.auditExpense(updated),
      });
      return this.getWith(tx, updated.id);
    });
  }

  async deleteDraft(actorId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM expenses WHERE id = ${id}::uuid FOR UPDATE`;
      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw notFound('EXPENSE_NOT_FOUND', 'Expense not found');
      if (expense.status !== 'draft') {
        throw conflict(
          'EXPENSE_ALREADY_POSTED',
          'Posted expenses are immutable; use a correction',
        );
      }
      const schedule = await tx.expenseSchedule.findUnique({
        where: { expense_id: id },
        select: { id: true },
      });
      if (schedule) {
        await tx.expenseScheduleInstallment.deleteMany({
          where: { schedule_id: schedule.id },
        });
        await tx.expenseSchedule.delete({ where: { id: schedule.id } });
      }
      await tx.expense.delete({ where: { id } });
      await this.audit.record(tx, {
        actorId,
        action: 'expense.delete',
        entityType: 'expense',
        entityId: id,
        before: this.auditExpense(expense),
      });
    });
  }

  async post(
    actor: Actor,
    id: string,
    key: string | undefined,
    input: PostExpenseDto,
  ) {
    const operationId = expenseIdempotencyKey(key);
    const result = await this.operations.execute({
      userId: actor.id,
      operationId,
      endpoint: `/admin/expenses/${id}/post`,
      payload: { id, ...input },
      work: async (tx) => {
        const expense = await tx.expense.findUnique({
          where: { id },
          include: {
            category: { include: { ledger_account: true } },
            cash_account: { include: { ledger_account: true } },
            schedule: true,
          },
        });
        if (!expense) throw notFound('EXPENSE_NOT_FOUND', 'Expense not found');
        if (expense.status === 'posted') {
          throw conflict('EXPENSE_ALREADY_POSTED', 'Expense is already posted');
        }
        if (expense.status !== 'draft') {
          throw conflict(
            'EXPENSE_INVALID_STATE',
            'Only a draft expense can be posted',
          );
        }
        if (!expense.category.is_active) {
          throw conflict(
            'EXPENSE_CATEGORY_INACTIVE',
            'Expense category is inactive',
          );
        }
        if ((await separationOfDutiesLevel(tx)) === 'strict') {
          assertDifferentActor(
            actor.id,
            expense.created_by,
            'A creator cannot post their own expense in strict mode',
            'EXPENSE_SELF_APPROVAL_FORBIDDEN',
          );
        }
        await this.expenseDates({
          documentDate: expense.document_date.toISOString().slice(0, 10),
          accountingDate: expense.accounting_date.toISOString().slice(0, 10),
          backdateReason: expense.backdate_reason ?? undefined,
          permissions: actor.permissions,
        });
        if (!expense.exchange_rate || !expense.amount_iqd) {
          throw conflict(
            'EXPENSE_INVALID_STATE',
            'Expense conversion snapshot is missing',
          );
        }
        if (expense.recognition_mode === 'prepaid' && !expense.schedule) {
          throw conflict(
            'EXPENSE_PREPAID_SCHEDULE_REQUIRED',
            'A prepaid expense requires a schedule before posting',
          );
        }
        const creditCode =
          expense.payment_mode === 'paid_now'
            ? expense.cash_account?.ledger_account.code
            : '2040';
        if (!creditCode) {
          throw conflict(
            'EXPENSE_CASH_ACCOUNT_REQUIRED',
            'An active cash account is required',
          );
        }
        if (expense.cash_account && !expense.cash_account.is_active) {
          throw conflict(
            'EXPENSE_CASH_ACCOUNT_INACTIVE',
            'Cash account is inactive',
          );
        }
        const debitCode =
          expense.recognition_mode === 'prepaid'
            ? '1060'
            : expense.category.ledger_account.code;
        const journal = await this.ledger.post(tx, {
          sourceType: 'expense',
          sourceId: expense.id,
          event: 'posted',
          documentDate: expense.document_date,
          accountingDate: expense.accounting_date,
          createdBy: actor.id,
          description: input.note?.trim() || expense.description,
          lines: expensePostingLines(
            debitCode,
            creditCode,
            expense.amount_currency,
            expense.amount_iqd,
            expense.currency_code,
            expense.exchange_rate,
          ),
        });
        await tx.expense.update({
          where: { id },
          data: {
            status: 'posted',
            posted_by: actor.id,
            posted_at: new Date(),
            journal_entry_id: journal.id,
            ...(expense.payment_mode === 'paid_now'
              ? {
                  paid_currency: expense.amount_currency,
                  balance_currency: new Prisma.Decimal(0),
                }
              : {}),
            updated_at: new Date(),
          },
        });
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'expense.post',
          entityType: 'expense',
          entityId: id,
          before: { status: 'draft' },
          after: { status: 'posted', journal_entry_id: journal.id },
        });
        return this.getWith(tx, id);
      },
    });
    if (this.scheduleQueue) {
      await this.scheduleQueue.add(
        'catch-up',
        {},
        {
          jobId: `expense-prepaid-${id}-${businessDateText()}`,
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    }
    return result;
  }

  pay(actor: Actor, id: string, key: string | undefined, input: PayExpenseDto) {
    const operationId = expenseIdempotencyKey(key);
    return this.operations.execute({
      userId: actor.id,
      operationId,
      endpoint: `/admin/expenses/${id}/payments`,
      payload: { id, ...input },
      responseStatus: 201,
      work: async (tx) => {
        const expense = await tx.expense.findUnique({
          where: { id },
          include: { currency: true },
        });
        if (!expense) throw notFound('EXPENSE_NOT_FOUND', 'Expense not found');
        if (expense.status !== 'posted' || expense.payment_mode !== 'owed') {
          throw conflict(
            'EXPENSE_INVALID_STATE',
            'Only a posted owed expense can be paid',
          );
        }
        if ((await separationOfDutiesLevel(tx)) === 'strict') {
          assertDifferentActor(
            actor.id,
            expense.created_by,
            'A creator cannot pay their own expense in strict mode',
            'EXPENSE_SELF_APPROVAL_FORBIDDEN',
          );
        }
        const dates = await this.expenseDates({
          documentDate: input.document_date,
          accountingDate: input.accounting_date,
          backdateReason: input.backdate_reason,
          permissions: actor.permissions,
        });
        const amount = new Prisma.Decimal(input.amount);
        if (!amount.gt(0))
          throw invalid(
            'EXPENSE_AMOUNT_INVALID',
            'Payment amount must be positive',
          );
        if (amount.decimalPlaces() > expense.currency.display_precision) {
          throw invalid(
            'EXPENSE_AMOUNT_PRECISION',
            `Payment amount exceeds ${expense.currency.display_precision} decimal places for ${expense.currency_code}`,
          );
        }
        if (amount.gt(expense.balance_currency)) {
          throw conflict(
            'EXPENSE_OVERPAYMENT',
            'Payment exceeds the expense balance',
          );
        }
        const cash = await this.validateCashAccount(
          tx,
          'paid_now',
          input.cash_account_id,
          expense.currency_code,
        );
        const rate = expense.exchange_rate!;
        const amountIqd = amount.times(rate);
        const paymentId = randomUUID();
        const journal = await this.ledger.post(tx, {
          sourceType: 'expense_payment',
          sourceId: paymentId,
          event: 'posted',
          ...dates,
          createdBy: actor.id,
          description:
            input.notes?.trim() || `Payment for ${expense.document_number}`,
          lines: expensePostingLines(
            '2040',
            cash!.ledger_account.code,
            amount,
            amountIqd,
            expense.currency_code,
            rate,
          ),
        });
        const documentNumber = await this.numbers.issue(
          tx,
          'expense_payment',
          'EPM',
          dates.accountingDate,
        );
        const payment = await tx.expensePayment.create({
          data: {
            id: paymentId,
            document_number: documentNumber,
            expense_id: id,
            cash_account_id: cash!.id,
            currency_code: expense.currency_code,
            amount_currency: amount,
            exchange_rate: rate,
            amount_iqd: amountIqd,
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            backdate_reason: dates.backdateReason,
            reference_number: input.reference_number?.trim(),
            notes: input.notes?.trim(),
            created_by: actor.id,
            journal_entry_id: journal.id,
          },
        });
        await tx.expense.update({
          where: { id },
          data: {
            paid_currency: { increment: amount },
            balance_currency: { decrement: amount },
            updated_at: new Date(),
          },
        });
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'expense.pay',
          entityType: 'expense',
          entityId: id,
          after: {
            payment_id: payment.id,
            amount: amount.toString(),
            cash_account_id: cash!.id,
          },
        });
        return this.getWith(tx, id);
      },
    });
  }

  cancelPrepaidSchedule(
    actor: Actor,
    id: string,
    key: string | undefined,
    input: CancelPrepaidScheduleDto,
  ) {
    return this.operations.execute({
      userId: actor.id,
      operationId: expenseIdempotencyKey(key),
      endpoint: `/admin/expenses/${id}/prepaid-schedule/cancel`,
      payload: { id, ...input },
      work: async (tx) => {
        const expense = await tx.expense.findUnique({
          where: { id },
          include: {
            cash_account: { include: { ledger_account: true } },
            schedule: {
              include: {
                installments: {
                  where: { status: 'pending' },
                  orderBy: { sequence: 'asc' },
                },
              },
            },
          },
        });
        if (!expense) throw notFound('EXPENSE_NOT_FOUND', 'Expense not found');
        if (
          expense.status !== 'posted' ||
          expense.recognition_mode !== 'prepaid' ||
          !expense.schedule
        ) {
          throw conflict(
            'EXPENSE_PREPAID_INVALID_STATE',
            'Only a posted prepaid expense with an active schedule can be cancelled',
          );
        }
        if (!['active', 'blocked'].includes(expense.schedule.status)) {
          throw conflict(
            'EXPENSE_PREPAID_INVALID_STATE',
            'The prepaid schedule has no remaining periods to cancel',
          );
        }
        if (!expense.cash_account || !expense.exchange_rate) {
          throw conflict(
            'EXPENSE_PREPAID_PAYMENT_REQUIRED',
            'A prepaid expense must have its original cash account and rate',
          );
        }
        if ((await separationOfDutiesLevel(tx)) === 'strict') {
          assertDifferentActor(
            actor.id,
            expense.created_by,
            'A creator cannot cancel their own prepaid schedule in strict mode',
            'EXPENSE_SELF_APPROVAL_FORBIDDEN',
          );
        }
        const dates = await this.expenseDates({
          documentDate: input.document_date,
          accountingDate: input.accounting_date,
          backdateReason: input.backdate_reason,
          permissions: actor.permissions,
        });
        const remaining = expense.schedule.installments.reduce(
          (sum, installment) => sum.plus(installment.amount_iqd),
          new Prisma.Decimal(0),
        );
        if (!remaining.gt(0)) {
          throw conflict(
            'EXPENSE_PREPAID_INVALID_STATE',
            'The prepaid schedule has no remaining balance',
          );
        }
        const originalAmount = remaining.div(expense.exchange_rate);
        const journal = await this.ledger.post(tx, {
          sourceType: 'expense_prepaid_schedule',
          sourceId: expense.schedule.id,
          event: 'cancelled',
          ...dates,
          createdBy: actor.id,
          description: input.reason.trim(),
          lines: expensePostingLines(
            expense.cash_account.ledger_account.code,
            '1060',
            originalAmount,
            remaining,
            expense.currency_code,
            expense.exchange_rate,
          ),
        });
        await tx.expenseScheduleInstallment.updateMany({
          where: { schedule_id: expense.schedule.id, status: 'pending' },
          data: { status: 'cancelled', last_error: null },
        });
        await tx.expenseSchedule.update({
          where: { id: expense.schedule.id },
          data: {
            status: 'cancelled',
            cancelled_iqd: remaining,
            cancelled_by: actor.id,
            cancelled_at: new Date(),
            cancel_reason: input.reason.trim(),
            cancellation_journal_entry_id: journal.id,
            updated_at: new Date(),
          },
        });
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'expense.prepaid.cancel',
          entityType: 'expense',
          entityId: id,
          after: {
            schedule_id: expense.schedule.id,
            cancelled_iqd: remaining.toString(),
            journal_entry_id: journal.id,
          },
          reason: input.reason.trim(),
        });
        return this.getWith(tx, id);
      },
    });
  }

  async processDueSchedules(asOf = businessDateText()) {
    const cutoff = parseBusinessDate(asOf);
    const schedules = await this.prisma.expenseSchedule.findMany({
      where: {
        status: { in: ['active', 'blocked'] },
        expense: { status: 'posted' },
        installments: {
          some: { status: 'pending', scheduled_date: { lte: cutoff } },
        },
      },
      select: {
        id: true,
        installments: {
          where: { status: 'pending', scheduled_date: { lte: cutoff } },
          select: { id: true },
          orderBy: { sequence: 'asc' },
        },
      },
      orderBy: { start_date: 'asc' },
    });
    let posted = 0;
    let blocked = 0;
    for (const schedule of schedules) {
      for (const installment of schedule.installments) {
        const result = await this.postScheduleInstallment(installment.id);
        if (result === 'posted') posted += 1;
        if (result === 'blocked') {
          blocked += 1;
          break;
        }
      }
    }
    return { schedules: schedules.length, posted, blocked, as_of: asOf };
  }

  private async postScheduleInstallment(id: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM expense_schedule_installments WHERE id = ${id}::uuid FOR UPDATE`;
        const installment = await tx.expenseScheduleInstallment.findUnique({
          where: { id },
          include: {
            schedule: {
              include: {
                expense: {
                  include: {
                    category: { include: { ledger_account: true } },
                  },
                },
              },
            },
          },
        });
        if (!installment || installment.status !== 'pending')
          return 'skipped' as const;
        const expense = installment.schedule.expense;
        if (
          expense.status !== 'posted' ||
          installment.schedule.status === 'cancelled'
        ) {
          return 'skipped' as const;
        }
        await this.dates.assertOpen(tx, installment.scheduled_date);
        const journal = await this.ledger.post(tx, {
          sourceType: 'expense_prepaid_amortization',
          sourceId: installment.id,
          event: 'posted',
          documentDate: installment.scheduled_date,
          accountingDate: installment.scheduled_date,
          createdBy: installment.schedule.created_by,
          description: `Prepaid recognition for ${expense.document_number}, period ${installment.sequence}`,
          lines: expensePostingLines(
            expense.category.ledger_account.code,
            '1060',
            installment.amount_iqd,
            installment.amount_iqd,
            'IQD',
            new Prisma.Decimal(1),
          ),
        });
        await tx.expenseScheduleInstallment.update({
          where: { id },
          data: {
            status: 'posted',
            journal_entry_id: journal.id,
            posted_at: new Date(),
            last_error: null,
          },
        });
        const remaining = await tx.expenseScheduleInstallment.count({
          where: { schedule_id: installment.schedule_id, status: 'pending' },
        });
        await tx.expenseSchedule.update({
          where: { id: installment.schedule_id },
          data: {
            status: remaining === 0 ? 'completed' : 'active',
            recognized_iqd: { increment: installment.amount_iqd },
            updated_at: new Date(),
          },
        });
        await this.audit.record(tx, {
          actorId: installment.schedule.created_by,
          action: 'expense.prepaid.recognize',
          entityType: 'expense',
          entityId: expense.id,
          after: {
            schedule_id: installment.schedule_id,
            installment_id: id,
            sequence: installment.sequence,
            amount_iqd: installment.amount_iqd.toString(),
            journal_entry_id: journal.id,
          },
        });
        return 'posted' as const;
      });
    } catch (error) {
      const response =
        error instanceof HttpException ? error.getResponse() : error;
      const text =
        typeof response === 'string' ? response : JSON.stringify(response);
      const closed =
        text.includes('PERIOD_CLOSED') || text.includes('period is closed');
      await this.prisma.$transaction(async (tx) => {
        const installment = await tx.expenseScheduleInstallment.findUnique({
          where: { id },
          select: { schedule_id: true, status: true },
        });
        if (!installment || installment.status !== 'pending') return;
        await tx.expenseScheduleInstallment.update({
          where: { id },
          data: {
            last_error: closed
              ? 'EXPENSE_PREPAID_PERIOD_CLOSED'
              : 'EXPENSE_PREPAID_POSTING_FAILED',
          },
        });
        await tx.expenseSchedule.update({
          where: { id: installment.schedule_id },
          data: { status: 'blocked', updated_at: new Date() },
        });
      });
      return 'blocked' as const;
    }
  }

  reverse(
    actor: Actor,
    id: string,
    key: string | undefined,
    input: ReverseExpenseDto,
  ) {
    const operationId = expenseIdempotencyKey(key);
    return this.operations.execute({
      userId: actor.id,
      operationId,
      endpoint: `/admin/expenses/${id}/reverse`,
      payload: { id, ...input },
      responseStatus: 201,
      work: async (tx) => {
        const expense = await tx.expense.findUnique({
          where: { id },
          include: {
            journal_entry: {
              include: { lines: { include: { account: true } } },
            },
            payments: {
              include: {
                journal_entry: {
                  include: { lines: { include: { account: true } } },
                },
              },
              orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
            },
            schedule: {
              include: {
                installments: {
                  where: { journal_entry_id: { not: null } },
                  include: {
                    journal_entry: {
                      include: { lines: { include: { account: true } } },
                    },
                  },
                  orderBy: { sequence: 'asc' },
                },
                cancellation_journal_entry: {
                  include: { lines: { include: { account: true } } },
                },
              },
            },
          },
        });
        if (!expense) throw notFound('EXPENSE_NOT_FOUND', 'Expense not found');
        if (expense.status !== 'posted' || !expense.journal_entry) {
          throw conflict(
            'EXPENSE_INVALID_STATE',
            'Only a posted expense can be reversed',
          );
        }
        if ((await separationOfDutiesLevel(tx)) === 'strict') {
          assertDifferentActor(
            actor.id,
            expense.created_by,
            'A creator cannot reverse their own expense in strict mode',
            'EXPENSE_SELF_APPROVAL_FORBIDDEN',
          );
        }
        const dates = await this.expenseDates({
          documentDate: input.document_date,
          accountingDate: input.accounting_date,
          backdateReason: input.backdate_reason,
          permissions: actor.permissions,
        });
        const correctionId = randomUUID();
        const documentNumber = await this.numbers.issue(
          tx,
          'expense_correction',
          'EXR',
          dates.accountingDate,
        );
        await tx.expenseCorrection.create({
          data: {
            id: correctionId,
            document_number: documentNumber,
            expense_id: id,
            reason: input.reason.trim(),
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            backdate_reason: dates.backdateReason,
            created_by: actor.id,
          },
        });
        const originals = [
          {
            role: 'expense',
            paymentId: undefined,
            journal: expense.journal_entry,
          },
          ...expense.payments.map((payment, index) => ({
            role: `payment-${index + 1}`,
            paymentId: payment.id,
            journal: payment.journal_entry,
          })),
          ...(expense.schedule?.installments ?? []).flatMap((installment) =>
            installment.journal_entry
              ? [
                  {
                    role: `prepaid-${installment.sequence}`,
                    paymentId: undefined,
                    journal: installment.journal_entry,
                  },
                ]
              : [],
          ),
          ...(expense.schedule?.cancellation_journal_entry
            ? [
                {
                  role: 'prepaid-cancel',
                  paymentId: undefined,
                  journal: expense.schedule.cancellation_journal_entry,
                },
              ]
            : []),
        ];
        for (const original of originals) {
          const reversal = await this.ledger.post(tx, {
            sourceType: 'expense_correction',
            sourceId: correctionId,
            event: original.role,
            ...dates,
            createdBy: actor.id,
            description: input.reason.trim(),
            reversesId: original.journal.id,
            lines: original.journal.lines.map((line) => ({
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
              memo: `Reversal of ${original.journal.document_number}`,
            })),
          });
          await tx.expenseCorrectionPosting.create({
            data: {
              correction_id: correctionId,
              expense_payment_id: original.paymentId,
              role: original.role,
              original_journal_entry_id: original.journal.id,
              reversal_journal_entry_id: reversal.id,
            },
          });
        }
        await tx.expense.update({
          where: { id },
          data: {
            status: 'reversed',
            balance_currency: 0,
            updated_at: new Date(),
          },
        });
        if (expense.schedule) {
          await tx.expenseScheduleInstallment.updateMany({
            where: {
              schedule_id: expense.schedule.id,
              status: 'pending',
            },
            data: { status: 'cancelled', last_error: null },
          });
          await tx.expenseSchedule.update({
            where: { id: expense.schedule.id },
            data: { status: 'reversed', updated_at: new Date() },
          });
        }
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'expense.reverse',
          entityType: 'expense',
          entityId: id,
          before: { status: 'posted' },
          after: { status: 'reversed', correction_id: correctionId },
          reason: input.reason.trim(),
        });
        return this.getWith(tx, id);
      },
    });
  }

  async get(id: string) {
    return this.getWith(this.prisma, id);
  }

  async list(query: ExpenseQueryDto) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 25;
    const where = this.where(query);
    const direction = query.direction ?? 'desc';
    const sortField =
      query.sort === 'amount'
        ? 'amount_iqd'
        : query.sort === 'payee'
          ? 'payee'
          : (query.sort ?? 'document_date');
    const [items, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        include: {
          category: true,
          supplier: { select: { id: true, name: true } },
          cash_account: { select: { id: true, name: true, kind: true } },
        },
        orderBy: [{ [sortField]: direction }, { id: direction }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.expense.count({ where }),
    ]);
    return {
      items: items.map((item) => this.presentSummary(item)),
      pagination: {
        page,
        per_page: perPage,
        total,
        pages: Math.ceil(total / perPage),
      },
    };
  }

  async totals(query: ExpenseQueryDto) {
    const where: Prisma.ExpenseWhereInput = {
      ...this.where(query),
      status: 'posted',
    };
    const [overall, grouped] = await Promise.all([
      this.prisma.expense.aggregate({
        where,
        _sum: { amount_iqd: true },
        _count: { _all: true },
      }),
      this.prisma.expense.groupBy({
        by: ['category_id'],
        where,
        _sum: { amount_iqd: true },
        _count: { _all: true },
        orderBy: { category_id: 'asc' },
      }),
    ]);
    const categories = await this.prisma.expenseCategory.findMany({
      where: { id: { in: grouped.map((item) => item.category_id) } },
      select: { id: true, name_ar: true, name_en: true },
    });
    const byId = new Map(categories.map((item) => [item.id, item]));
    return {
      total_iqd: overall._sum.amount_iqd ?? new Prisma.Decimal(0),
      document_count: overall._count._all,
      per_category: grouped.map((item) => ({
        category: byId.get(item.category_id)!,
        total_iqd: item._sum.amount_iqd ?? new Prisma.Decimal(0),
        document_count: item._count._all,
      })),
    };
  }

  private where(query: ExpenseQueryDto): Prisma.ExpenseWhereInput {
    const search = query.search?.trim();
    const payee = query.payee?.trim();
    return {
      ...(query.from || query.to
        ? {
            document_date: {
              ...(query.from ? { gte: parseBusinessDate(query.from) } : {}),
              ...(query.to ? { lte: parseBusinessDate(query.to) } : {}),
            },
          }
        : {}),
      ...(query.category_id ? { category_id: query.category_id } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.cash_account_id
        ? {
            OR: [
              { cash_account_id: query.cash_account_id },
              {
                payments: { some: { cash_account_id: query.cash_account_id } },
              },
            ],
          }
        : {}),
      ...(payee
        ? {
            OR: [
              { payee: { contains: payee, mode: 'insensitive' } },
              { supplier: { name: { contains: payee, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(query.unpaid_only
        ? {
            status: 'posted',
            payment_mode: 'owed',
            balance_currency: { gt: 0 },
          }
        : {}),
      ...(search
        ? {
            AND: [
              {
                OR: [
                  {
                    document_number: { contains: search, mode: 'insensitive' },
                  },
                  { payee: { contains: search, mode: 'insensitive' } },
                  {
                    supplier: {
                      name: { contains: search, mode: 'insensitive' },
                    },
                  },
                  { description: { contains: search, mode: 'insensitive' } },
                  {
                    reference_number: { contains: search, mode: 'insensitive' },
                  },
                ],
              },
            ],
          }
        : {}),
    };
  }

  private async getWith(
    db: Pick<Prisma.TransactionClient, 'expense'>,
    id: string,
  ) {
    const expense = await db.expense.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!expense) throw notFound('EXPENSE_NOT_FOUND', 'Expense not found');
    return this.present(expense);
  }

  private present(
    expense: Prisma.ExpenseGetPayload<{ include: typeof detailInclude }>,
  ) {
    return {
      id: expense.id,
      document_number: expense.document_number,
      status: expense.status,
      category: this.presentCategory(expense.category),
      amount_currency: expense.amount_currency,
      currency_code: expense.currency_code,
      exchange_rate: expense.exchange_rate,
      amount_iqd: expense.amount_iqd,
      paid_currency: expense.paid_currency,
      balance_currency: expense.balance_currency,
      recognition_mode: expense.recognition_mode,
      receipt: expense.receipt
        ? { ...expense.receipt, download_url: expense.receipt.public_url }
        : null,
      balance_iqd: expense.exchange_rate
        ? expense.balance_currency.times(expense.exchange_rate)
        : null,
      payment_mode: expense.payment_mode,
      cash_account: expense.cash_account
        ? {
            id: expense.cash_account.id,
            name: expense.cash_account.name,
            kind: expense.cash_account.kind,
            currency_code: expense.cash_account.currency_code,
          }
        : null,
      supplier: expense.supplier,
      payee: expense.payee,
      description: expense.description,
      reference_number: expense.reference_number,
      document_date: expense.document_date,
      accounting_date: expense.accounting_date,
      backdate_reason: expense.backdate_reason,
      created_by: expense.created_by,
      posted_by: expense.posted_by,
      posted_at: expense.posted_at,
      created_at: expense.created_at,
      updated_at: expense.updated_at,
      creator: expense.creator,
      poster: expense.poster,
      journal_entry: expense.journal_entry
        ? this.presentJournal(expense.journal_entry)
        : null,
      payments: expense.payments.map((payment) => ({
        id: payment.id,
        document_number: payment.document_number,
        amount_currency: payment.amount_currency,
        currency_code: payment.currency_code,
        exchange_rate: payment.exchange_rate,
        amount_iqd: payment.amount_iqd,
        cash_account: payment.cash_account,
        document_date: payment.document_date,
        accounting_date: payment.accounting_date,
        backdate_reason: payment.backdate_reason,
        reference_number: payment.reference_number,
        notes: payment.notes,
        created_by: payment.created_by,
        created_at: payment.created_at,
        creator: payment.creator,
        journal_entry: this.presentJournal(payment.journal_entry),
      })),
      corrections: expense.corrections.map((correction) => ({
        id: correction.id,
        document_number: correction.document_number,
        reason: correction.reason,
        document_date: correction.document_date,
        accounting_date: correction.accounting_date,
        backdate_reason: correction.backdate_reason,
        created_by: correction.created_by,
        created_at: correction.created_at,
        creator: correction.creator,
        postings: correction.postings.map((posting) => ({
          id: posting.id,
          role: posting.role,
          expense_payment_id: posting.expense_payment_id,
          original_journal_entry_id: posting.original_journal_entry_id,
          reversal_journal_entry: this.presentJournal(
            posting.reversal_journal_entry,
          ),
        })),
      })),
      prepaid_schedule: expense.schedule
        ? {
            id: expense.schedule.id,
            status: expense.schedule.status,
            start_date: expense.schedule.start_date,
            periods: expense.schedule.periods,
            amount_iqd: expense.schedule.amount_iqd,
            recognized_iqd: expense.schedule.recognized_iqd,
            cancelled_iqd: expense.schedule.cancelled_iqd,
            created_by: expense.schedule.created_by,
            cancelled_by: expense.schedule.cancelled_by,
            cancelled_at: expense.schedule.cancelled_at,
            cancel_reason: expense.schedule.cancel_reason,
            created_at: expense.schedule.created_at,
            updated_at: expense.schedule.updated_at,
            creator: expense.schedule.creator,
            canceller: expense.schedule.canceller,
            cancellation_journal_entry: expense.schedule
              .cancellation_journal_entry
              ? this.presentJournal(expense.schedule.cancellation_journal_entry)
              : null,
            installments: expense.schedule.installments.map((installment) => ({
              id: installment.id,
              sequence: installment.sequence,
              scheduled_date: installment.scheduled_date,
              amount_iqd: installment.amount_iqd,
              status: installment.status,
              posted_at: installment.posted_at,
              last_error: installment.last_error,
              journal_entry: installment.journal_entry
                ? this.presentJournal(installment.journal_entry)
                : null,
            })),
          }
        : null,
    };
  }

  private presentSummary(expense: {
    id: string;
    document_number: string;
    status: string;
    amount_currency: Prisma.Decimal;
    amount_iqd: Prisma.Decimal | null;
    paid_currency: Prisma.Decimal;
    balance_currency: Prisma.Decimal;
    currency_code: string;
    payment_mode: string;
    recognition_mode: string;
    payee: string | null;
    description: string;
    document_date: Date;
    created_at: Date;
    category: { id: string; name_ar: string; name_en: string };
    supplier: { id: string; name: string } | null;
    cash_account: { id: string; name: string; kind: string } | null;
  }) {
    return {
      id: expense.id,
      document_number: expense.document_number,
      status: expense.status,
      category: {
        id: expense.category.id,
        name_ar: expense.category.name_ar,
        name_en: expense.category.name_en,
      },
      amount_currency: expense.amount_currency,
      amount_iqd: expense.amount_iqd,
      paid_currency: expense.paid_currency,
      balance_currency: expense.balance_currency,
      currency_code: expense.currency_code,
      payment_mode: expense.payment_mode,
      recognition_mode: expense.recognition_mode,
      payee: expense.payee,
      supplier: expense.supplier,
      cash_account: expense.cash_account,
      description: expense.description,
      document_date: expense.document_date,
      created_at: expense.created_at,
    };
  }

  private presentCategory(category: {
    id: string;
    code: string;
    name_ar: string;
    name_en: string;
    ledger_account_id: string;
    is_active: boolean;
    is_system: boolean;
    created_at: Date;
    updated_at: Date;
    ledger_account: Prisma.LedgerAccountGetPayload<object>;
    _count?: { expenses: number };
  }) {
    return {
      id: category.id,
      code: category.code,
      name_ar: category.name_ar,
      name_en: category.name_en,
      ledger_account_id: category.ledger_account_id,
      is_active: category.is_active,
      is_system: category.is_system,
      created_at: category.created_at,
      updated_at: category.updated_at,
      ledger_account: category.ledger_account,
      ...(category._count ? { expense_count: category._count.expenses } : {}),
    };
  }

  private presentJournal(entry: JournalWithLines) {
    return {
      id: entry.id,
      document_number: entry.document_number,
      source_type: entry.source_type,
      source_id: entry.source_id,
      event: entry.event,
      document_date: entry.document_date,
      accounting_date: entry.accounting_date,
      description: entry.description,
      created_by: entry.created_by,
      posted_at: entry.posted_at,
      reverses_id: entry.reverses_id,
      lines: entry.lines.map((line) => ({
        id: line.id,
        entry_id: line.entry_id,
        account_id: line.account_id,
        debit_base: line.debit_base.toString(),
        credit_base: line.credit_base.toString(),
        currency_code: line.currency_code,
        original_amount: line.original_amount.toString(),
        exchange_rate: line.exchange_rate.toString(),
        memo: line.memo,
        account: line.account,
      })),
    };
  }

  private validateRecognition(
    mode: 'immediate' | 'prepaid',
    paymentMode: 'paid_now' | 'owed',
    schedule: { start_date: string; periods: number } | null | undefined,
  ) {
    if (mode === 'prepaid') {
      if (paymentMode !== 'paid_now') {
        throw invalid(
          'EXPENSE_PREPAID_PAYMENT_REQUIRED',
          'A prepaid expense must be paid now from a cash account',
        );
      }
      if (!schedule) {
        throw invalid(
          'EXPENSE_PREPAID_SCHEDULE_REQUIRED',
          'A prepaid expense requires a monthly schedule',
        );
      }
      if (
        !Number.isInteger(schedule.periods) ||
        schedule.periods < 2 ||
        schedule.periods > 120
      ) {
        throw invalid(
          'EXPENSE_PREPAID_PERIODS_INVALID',
          'Prepaid schedule periods must be between 2 and 120',
        );
      }
      monthlyBusinessDates(schedule.start_date, schedule.periods);
      return;
    }
    if (schedule) {
      throw invalid(
        'EXPENSE_PREPAID_SCHEDULE_NOT_ALLOWED',
        'An immediate expense cannot include a prepaid schedule',
      );
    }
  }

  private async createSchedule(
    tx: Prisma.TransactionClient,
    expenseId: string,
    actorId: string,
    amountIqd: Prisma.Decimal,
    input: { start_date: string; periods: number },
  ) {
    const dates = monthlyBusinessDates(input.start_date, input.periods);
    const amounts = splitScheduleAmount(amountIqd, input.periods);
    if (amounts.some((amount) => !amount.gt(0))) {
      throw invalid(
        'EXPENSE_PREPAID_AMOUNT_TOO_SMALL',
        'The prepaid amount is too small for the requested number of periods',
      );
    }
    const schedule = await tx.expenseSchedule.create({
      data: {
        expense_id: expenseId,
        start_date: dates[0],
        periods: input.periods,
        amount_iqd: amountIqd,
        created_by: actorId,
      },
    });
    await tx.expenseScheduleInstallment.createMany({
      data: dates.map((date, index) => ({
        schedule_id: schedule.id,
        sequence: index + 1,
        scheduled_date: date,
        amount_iqd: amounts[index],
      })),
    });
    return schedule;
  }

  private async requireExpenseAccount(
    tx: Prisma.TransactionClient,
    id: string,
  ) {
    const account = await tx.ledgerAccount.findUnique({ where: { id } });
    if (!account || account.type !== 'expense' || !account.enabled) {
      throw invalid(
        'EXPENSE_LEDGER_ACCOUNT_INVALID',
        'An enabled expense GL account is required',
      );
    }
    return account;
  }

  private async validateCashAccount(
    tx: Prisma.TransactionClient,
    mode: 'paid_now' | 'owed',
    id: string | undefined,
    currencyCode: string,
  ) {
    if (mode === 'owed') {
      if (id) {
        throw invalid(
          'EXPENSE_CASH_ACCOUNT_NOT_ALLOWED',
          'An owed expense cannot select a cash account until payment',
        );
      }
      return null;
    }
    if (!id) {
      throw invalid(
        'EXPENSE_CASH_ACCOUNT_REQUIRED',
        'A cash account is required',
      );
    }
    const cash = await tx.cashAccount.findUnique({
      where: { id },
      include: { ledger_account: true },
    });
    if (!cash)
      throw notFound(
        'EXPENSE_CASH_ACCOUNT_NOT_FOUND',
        'Cash account not found',
      );
    if (!cash.is_active) {
      throw conflict(
        'EXPENSE_CASH_ACCOUNT_INACTIVE',
        'Cash account is inactive',
      );
    }
    if (cash.currency_code !== currencyCode) {
      throw invalid(
        'EXPENSE_CASH_ACCOUNT_CURRENCY_MISMATCH',
        'Cash account currency must match the expense currency',
      );
    }
    return cash;
  }

  private async expenseDates(input: DateRuleInput) {
    try {
      return await this.dates.validate(input);
    } catch (error) {
      if (error instanceof HttpException) {
        const response = error.getResponse();
        const text =
          typeof response === 'string' ? response : JSON.stringify(response);
        if (
          text.includes('PERIOD_CLOSED') ||
          (text.includes('period') && text.includes('closed'))
        ) {
          throw conflict(
            'EXPENSE_PERIOD_CLOSED',
            'The expense period is closed',
          );
        }
        if (text.includes('backdate.approve') || text.includes('back-dated')) {
          throw forbidden(
            'EXPENSE_BACKDATE_WINDOW',
            'The expense is outside the 90-day back-dating window',
          );
        }
      }
      throw error;
    }
  }

  private auditExpense(expense: {
    document_number: string;
    category_id: string;
    amount_currency: Prisma.Decimal;
    currency_code: string;
    amount_iqd: Prisma.Decimal | null;
    payment_mode: string;
    recognition_mode: string;
    cash_account_id: string | null;
    supplier_id: string | null;
    payee: string | null;
    status: string;
  }): Prisma.InputJsonObject {
    return {
      document_number: expense.document_number,
      category_id: expense.category_id,
      amount_currency: expense.amount_currency.toString(),
      currency_code: expense.currency_code,
      amount_iqd: expense.amount_iqd?.toString() ?? null,
      payment_mode: expense.payment_mode,
      recognition_mode: expense.recognition_mode,
      cash_account_id: expense.cash_account_id,
      supplier_id: expense.supplier_id,
      payee: expense.payee,
      status: expense.status,
    };
  }
}
