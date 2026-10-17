import { HttpException, Injectable } from '@nestjs/common';
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
import { parseBusinessDate } from '../finance/business-date';
import { MediaService, type UploadedImage } from '../media/media.service';
import {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  ExpenseQueryDto,
  PayExpenseDto,
  PostExpenseDto,
  ReverseExpenseDto,
  UpdateExpenseCategoryDto,
} from './dto/expenses.dto';
import { expenseIdempotencyKey, expensePostingLines } from './expense-rules';

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
  ) {}

  async listCategories() {
    const categories = await this.prisma.expenseCategory.findMany({
      include: { ledger_account: true, _count: { select: { expenses: true } } },
      orderBy: [{ is_active: 'desc' }, { name_en: 'asc' }, { id: 'asc' }],
    });
    return categories.map((category) => this.presentCategory(category));
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
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'expense.create',
          entityType: 'expense',
          entityId: expense.id,
          after: this.auditExpense(expense),
        });
        return this.present(expense);
      },
    });
  }

  post(
    actor: Actor,
    id: string,
    key: string | undefined,
    input: PostExpenseDto,
  ) {
    const operationId = expenseIdempotencyKey(key);
    return this.operations.execute({
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
        const journal = await this.ledger.post(tx, {
          sourceType: 'expense',
          sourceId: expense.id,
          event: 'posted',
          documentDate: expense.document_date,
          accountingDate: expense.accounting_date,
          createdBy: actor.id,
          description: input.note?.trim() || expense.description,
          lines: expensePostingLines(
            expense.category.ledger_account.code,
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
      cash_account_id: expense.cash_account_id,
      supplier_id: expense.supplier_id,
      payee: expense.payee,
      status: expense.status,
    };
  }
}
