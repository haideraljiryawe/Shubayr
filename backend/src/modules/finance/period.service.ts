import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

type TrialRow = {
  code: string;
  name_en: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
};

@Injectable()
export class PeriodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.accountingPeriod.findMany({
      include: { closes: { orderBy: { sequence: 'desc' } } },
      orderBy: { month: 'desc' },
    });
  }

  async checklist(monthText: string) {
    const { start, end } = this.range(monthText);
    const [drafts, journalCount, imbalance] = await Promise.all([
      this.prisma.documentDraft.count(),
      this.prisma.journalEntry.count({
        where: { accounting_date: { gte: start, lt: end } },
      }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT count(*)::bigint AS count
        FROM journal_entries e
        JOIN journal_lines l ON l.entry_id = e.id
        WHERE e.accounting_date >= ${start} AND e.accounting_date < ${end}
        GROUP BY e.id
        HAVING sum(l.debit_base) <> sum(l.credit_base)
      `),
    ]);
    const checks = [
      {
        key: 'balanced_journals',
        passed: imbalance.length === 0,
        count: imbalance.length,
      },
      { key: 'unposted_drafts', passed: drafts === 0, count: drafts },
      {
        key: 'posted_journals',
        passed: journalCount > 0,
        count: journalCount,
        advisory: true,
      },
    ];
    return {
      month: monthText,
      can_close: checks
        .filter((item) => !item.advisory)
        .every((item) => item.passed),
      checks,
    };
  }

  async close(actorId: string, monthText: string, reason?: string) {
    const checklist = await this.checklist(monthText);
    if (!checklist.can_close)
      throw new ConflictException('Period close checklist failed');
    const { start, end } = this.range(monthText);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ locked: string }>>(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`period:${monthText}`}))::text AS locked`,
      );
      const period = await tx.accountingPeriod.upsert({
        where: { month: start },
        create: { month: start },
        update: {},
        include: { closes: { orderBy: { sequence: 'desc' }, take: 1 } },
      });
      if (period.status === 'closed')
        throw new ConflictException('Period is already closed');
      const rows = await tx.$queryRaw<TrialRow[]>(Prisma.sql`
        SELECT a.code, a.name_en,
               coalesce(sum(l.debit_base) FILTER (WHERE e.id IS NOT NULL), 0)::numeric AS debit,
               coalesce(sum(l.credit_base) FILTER (WHERE e.id IS NOT NULL), 0)::numeric AS credit
        FROM ledger_accounts a
        LEFT JOIN journal_lines l ON l.account_id = a.id
        LEFT JOIN journal_entries e ON e.id = l.entry_id AND e.accounting_date < ${end}
        GROUP BY a.id, a.code, a.name_en
        ORDER BY a.code
      `);
      const snapshot = rows.map((row) => ({
        code: row.code,
        name_en: row.name_en,
        debit: row.debit.toString(),
        credit: row.credit.toString(),
        balance: row.debit.minus(row.credit).toString(),
      }));
      const previous = period.closes[0]?.snapshot ?? null;
      const differences = previous ? this.diff(previous, snapshot) : [];
      const sequence = (period.closes[0]?.sequence ?? 0) + 1;
      const closed = await tx.periodClose.create({
        data: {
          period_month: start,
          sequence,
          snapshot,
          differences,
          reason,
          closed_by: actorId,
        },
      });
      await tx.accountingPeriod.update({
        where: { month: start },
        data: {
          status: 'closed',
          closed_at: new Date(),
          closed_by: actorId,
        },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'accounting_period.close',
        entityType: 'accounting_period',
        after: { sequence, reason: reason ?? null },
        reason,
      });
      return { ...closed, checklist };
    });
  }

  async reopen(actorId: string, monthText: string, reason: string) {
    const { start } = this.range(monthText);
    return this.prisma.$transaction(async (tx) => {
      const period = await tx.accountingPeriod.findUnique({
        where: { month: start },
      });
      if (!period || period.status !== 'closed') {
        throw new ConflictException('Period is not closed');
      }
      const updated = await tx.accountingPeriod.update({
        where: { month: start },
        data: {
          status: 'open',
          reopened_at: new Date(),
          reopened_by: actorId,
          reopen_reason: reason,
        },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'accounting_period.reopen',
        entityType: 'accounting_period',
        before: { status: period.status },
        after: { status: updated.status },
        reason,
      });
      return updated;
    });
  }

  private range(monthText: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthText)) {
      throw new UnprocessableEntityException('Month must use YYYY-MM');
    }
    const [year, month] = monthText.split('-').map(Number);
    return {
      start: new Date(Date.UTC(year, month - 1, 1)),
      end: new Date(Date.UTC(year, month, 1)),
    };
  }

  private diff(
    previous: Prisma.JsonValue,
    current: Array<Record<string, string>>,
  ) {
    const oldRows = Array.isArray(previous) ? previous : [];
    const old = new Map(
      oldRows
        .filter((row): row is Record<string, Prisma.JsonValue> =>
          Boolean(row && typeof row === 'object' && !Array.isArray(row)),
        )
        .map((row) => [
          typeof row.code === 'string' ? row.code : '',
          typeof row.balance === 'string' || typeof row.balance === 'number'
            ? `${row.balance}`
            : '0',
        ]),
    );
    return current
      .filter((row) => old.get(row.code) !== row.balance)
      .map((row) => ({
        code: row.code,
        before: old.get(row.code) ?? '0',
        after: row.balance,
      }));
  }
}
