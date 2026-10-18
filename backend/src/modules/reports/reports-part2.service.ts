import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  addBusinessDateDays,
  businessDateText,
  parseBusinessDate,
} from '../finance/business-date';
import type {
  AsOfReportQueryDto,
  InventoryValuationQueryDto,
  PeriodReportQueryDto,
} from './reports.dto';

type Actor = { id: string; permissions: string[] };
type Value = Prisma.Decimal | bigint | number | string | null;
const ZERO = new Prisma.Decimal(0);

function decimal(value: Value): Prisma.Decimal {
  return value === null ? ZERO : new Prisma.Decimal(value.toString());
}

function money(value: Value): string {
  return decimal(value).toFixed(4);
}

function integer(value: bigint | number | null): number {
  return Number(value ?? 0);
}

function reportError(message: string): UnprocessableEntityException {
  return new UnprocessableEntityException({
    status: 422,
    code: 'REPORT_PARAMETERS_INVALID',
    message,
    errors: [],
  });
}

@Injectable()
export class ReportsPart2Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async cash(actor: Actor, query: PeriodReportQueryDto, audit = true) {
    const range = this.range(query.from, query.to);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 50;
    type Row = {
      id: string;
      name: string;
      kind: string;
      currency_code: string;
      opening: Value;
      inflows: Value;
      outflows: Value;
      customer_receipts_in: Value;
      customer_receipts_out: Value;
      supplier_payments_in: Value;
      supplier_payments_out: Value;
      expense_payments_in: Value;
      expense_payments_out: Value;
      refunds_in: Value;
      refunds_out: Value;
      transfers_in: Value;
      transfers_out: Value;
      corrections_in: Value;
      corrections_out: Value;
      other_in: Value;
      other_out: Value;
    };
    const rows = await this.prisma.$queryRaw<Row[]>(Prisma.sql`
      WITH activity AS (
        SELECT ca.id, ca.name, ca.kind, ca.currency_code,
          je.accounting_date, je.source_type, je.event,
          jl.debit_base, jl.credit_base,
          CASE
            WHEN je.source_type IN ('journal_reversal','cash_receipt_reversal','expense_correction','custody_exception_reversal') THEN 'corrections'
            WHEN je.source_type = 'cash_receipt' THEN 'customer_receipts'
            WHEN je.source_type = 'supplier_payment' THEN 'supplier_payments'
            WHEN je.source_type IN ('expense','expense_payment') THEN 'expense_payments'
            WHEN je.source_type IN ('return','custody_exception') AND je.event LIKE '%refund%' THEN 'refunds'
            WHEN je.source_type = 'cash_transfer' THEN 'transfers'
            ELSE 'other'
          END AS source
        FROM cash_accounts ca
        LEFT JOIN journal_lines jl ON jl.account_id = ca.ledger_account_id
        LEFT JOIN journal_entries je ON je.id = jl.entry_id
      )
      SELECT id, name, kind, currency_code,
        COALESCE(SUM(debit_base-credit_base) FILTER (WHERE accounting_date < ${range.from}),0) AS opening,
        COALESCE(SUM(debit_base) FILTER (WHERE accounting_date BETWEEN ${range.from} AND ${range.to}),0) AS inflows,
        COALESCE(SUM(credit_base) FILTER (WHERE accounting_date BETWEEN ${range.from} AND ${range.to}),0) AS outflows,
        COALESCE(SUM(debit_base) FILTER (WHERE accounting_date BETWEEN ${range.from} AND ${range.to} AND source='customer_receipts'),0) AS customer_receipts_in,
        COALESCE(SUM(credit_base) FILTER (WHERE accounting_date BETWEEN ${range.from} AND ${range.to} AND source='customer_receipts'),0) AS customer_receipts_out,
        COALESCE(SUM(debit_base) FILTER (WHERE accounting_date BETWEEN ${range.from} AND ${range.to} AND source='supplier_payments'),0) AS supplier_payments_in,
        COALESCE(SUM(credit_base) FILTER (WHERE accounting_date BETWEEN ${range.from} AND ${range.to} AND source='supplier_payments'),0) AS supplier_payments_out,
        COALESCE(SUM(debit_base) FILTER (WHERE accounting_date BETWEEN ${range.from} AND ${range.to} AND source='expense_payments'),0) AS expense_payments_in,
        COALESCE(SUM(credit_base) FILTER (WHERE accounting_date BETWEEN ${range.from} AND ${range.to} AND source='expense_payments'),0) AS expense_payments_out,
        COALESCE(SUM(debit_base) FILTER (WHERE accounting_date BETWEEN ${range.from} AND ${range.to} AND source='refunds'),0) AS refunds_in,
        COALESCE(SUM(credit_base) FILTER (WHERE accounting_date BETWEEN ${range.from} AND ${range.to} AND source='refunds'),0) AS refunds_out,
        COALESCE(SUM(debit_base) FILTER (WHERE accounting_date BETWEEN ${range.from} AND ${range.to} AND source='transfers'),0) AS transfers_in,
        COALESCE(SUM(credit_base) FILTER (WHERE accounting_date BETWEEN ${range.from} AND ${range.to} AND source='transfers'),0) AS transfers_out,
        COALESCE(SUM(debit_base) FILTER (WHERE accounting_date BETWEEN ${range.from} AND ${range.to} AND source='corrections'),0) AS corrections_in,
        COALESCE(SUM(credit_base) FILTER (WHERE accounting_date BETWEEN ${range.from} AND ${range.to} AND source='corrections'),0) AS corrections_out,
        COALESCE(SUM(debit_base) FILTER (WHERE accounting_date BETWEEN ${range.from} AND ${range.to} AND source='other'),0) AS other_in,
        COALESCE(SUM(credit_base) FILTER (WHERE accounting_date BETWEEN ${range.from} AND ${range.to} AND source='other'),0) AS other_out
      FROM activity
      GROUP BY id,name,kind,currency_code
      ORDER BY name ASC,id ASC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `);
    const summary = await this.prisma.$queryRaw<
      Array<{ opening: Value; inflows: Value; outflows: Value; total: bigint }>
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(jl.debit_base-jl.credit_base) FILTER (WHERE je.accounting_date < ${range.from}),0) AS opening,
        COALESCE(SUM(jl.debit_base) FILTER (WHERE je.accounting_date BETWEEN ${range.from} AND ${range.to}),0) AS inflows,
        COALESCE(SUM(jl.credit_base) FILTER (WHERE je.accounting_date BETWEEN ${range.from} AND ${range.to}),0) AS outflows,
        (SELECT COUNT(*) FROM cash_accounts) AS total
      FROM cash_accounts ca
      LEFT JOIN journal_lines jl ON jl.account_id=ca.ledger_account_id
      LEFT JOIN journal_entries je ON je.id=jl.entry_id
    `);
    const total = summary[0];
    const response = {
      from: query.from,
      to: query.to,
      currency: 'IQD',
      touches_open_period: await this.touchesOpenPeriod(range.from, range.to),
      totals: {
        opening_balance: money(total.opening),
        inflows: money(total.inflows),
        outflows: money(total.outflows),
        closing_balance: decimal(total.opening)
          .plus(decimal(total.inflows))
          .minus(decimal(total.outflows))
          .toFixed(4),
      },
      pagination: this.pagination(page, perPage, integer(total.total)),
      data: rows.map((row) => this.cashRow(row)),
    };
    if (audit) await this.auditRead(actor.id, 'cash', query);
    return response;
  }

  async deliveryCustody(actor: Actor, query: AsOfReportQueryDto, audit = true) {
    const asOf = parseBusinessDate(query.as_of);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 50;
    const canViewCost = actor.permissions.includes('cost.view');
    type Row = {
      id: string;
      kind: string;
      name: string;
      goods_quantity: Value;
      goods_value: Value;
      cash_held: Value;
      oldest_goods_at: Date | null;
      oldest_cash_at: Date | null;
      total: bigint;
    };
    const rows = await this.prisma.$queryRaw<Row[]>(Prisma.sql`
      WITH goods_activity AS (
        SELECT custody_party_id AS party_id,
          CASE WHEN type IN ('issue_to_custody','custody_exception_reversal','return_reversal') THEN quantity ELSE -quantity END AS quantity,
          CASE WHEN type IN ('issue_to_custody','custody_exception_reversal','return_reversal') THEN quantity*unit_cost_iqd ELSE -quantity*unit_cost_iqd END AS value,
          CASE WHEN type='issue_to_custody' THEN created_at END AS issued_at
        FROM stock_movements
        WHERE custody_party_id IS NOT NULL
          AND type IN ('issue_to_custody','custody_to_sold','custody_exception','custody_exception_reversal','return_in','return_reversal')
          AND created_at < ((${asOf}::date + interval '1 day') AT TIME ZONE 'Asia/Baghdad')
      ), goods AS (
        SELECT party_id,SUM(quantity) AS quantity,SUM(value) AS value,MIN(issued_at) AS oldest_at
        FROM goods_activity GROUP BY party_id HAVING SUM(quantity)<>0 OR SUM(value)<>0
      ), cash_activity AS (
        SELECT party_id,collected_amount AS amount,COALESCE(confirmed_at,delivered_at) AS occurred_at
        FROM delivery_collections
        WHERE status IN ('confirmed_full','confirmed_short') AND collected_amount IS NOT NULL AND accounting_date<=${asOf}
        UNION ALL
        SELECT v.party_id,-v.amount_iqd,v.created_at
        FROM cash_receipt_vouchers v
        LEFT JOIN cash_receipt_reversals rev ON rev.voucher_id=v.id AND rev.accounting_date<=${asOf}
        WHERE v.accounting_date<=${asOf} AND rev.id IS NULL
        UNION ALL
        SELECT dc.party_id,-p.amount_iqd,p.created_at
        FROM return_refund_payments p JOIN delivery_collections dc ON dc.id=p.collection_id
        WHERE p.collection_id IS NOT NULL AND p.accounting_date<=${asOf}
        UNION ALL
        SELECT dc.party_id,-a.amount_iqd,a.created_at
        FROM external_driver_trip_settlement_allocations a
        JOIN delivery_collections dc ON dc.id=a.collection_id
        JOIN external_driver_trips t ON t.id=a.trip_id
        WHERE t.accounting_date<=${asOf}
        UNION ALL
        SELECT e.party_id,e.amount_iqd,e.created_at
        FROM custody_exceptions e
        LEFT JOIN custody_exception_reversals rev ON rev.exception_id=e.id AND rev.accounting_date<=${asOf}
        WHERE e.type='goods_loss' AND e.liability_bearer='party'
          AND e.accounting_date<=${asOf} AND rev.id IS NULL
      ), cash AS (
        SELECT party_id,SUM(amount) AS amount,MIN(occurred_at) FILTER (WHERE amount>0) AS oldest_at
        FROM cash_activity GROUP BY party_id HAVING SUM(amount)<>0
      ), combined AS (
        SELECT p.id,p.kind,p.name,COALESCE(g.quantity,0) AS goods_quantity,
          COALESCE(g.value,0) AS goods_value,COALESCE(c.amount,0) AS cash_held,
          g.oldest_at AS oldest_goods_at,c.oldest_at AS oldest_cash_at
        FROM delivery_parties p
        LEFT JOIN goods g ON g.party_id=p.id LEFT JOIN cash c ON c.party_id=p.id
        WHERE COALESCE(g.quantity,0)<>0 OR COALESCE(g.value,0)<>0 OR COALESCE(c.amount,0)<>0
      )
      SELECT *,COUNT(*) OVER() AS total FROM combined
      ORDER BY name ASC,id ASC LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `);
    const ledger = await this.accountBalances(['1010', '1020'], asOf);
    // Page totals are not overall totals, so calculate overall operational
    // balances directly when the result spans more than one page.
    const overall = await this.prisma.$queryRaw<
      Array<{ goods_quantity: Value; goods_value: Value; cash_held: Value }>
    >(Prisma.sql`
      WITH goods AS (
        SELECT
          SUM(CASE WHEN type IN ('issue_to_custody','custody_exception_reversal','return_reversal') THEN quantity ELSE -quantity END) AS quantity,
          SUM(CASE WHEN type IN ('issue_to_custody','custody_exception_reversal','return_reversal') THEN quantity*unit_cost_iqd ELSE -quantity*unit_cost_iqd END) AS value
        FROM stock_movements WHERE custody_party_id IS NOT NULL
          AND type IN ('issue_to_custody','custody_to_sold','custody_exception','custody_exception_reversal','return_in','return_reversal')
          AND created_at < ((${asOf}::date + interval '1 day') AT TIME ZONE 'Asia/Baghdad')
      ), cash AS (
        SELECT
          (SELECT COALESCE(SUM(collected_amount),0) FROM delivery_collections WHERE status IN ('confirmed_full','confirmed_short') AND accounting_date<=${asOf})
          - (SELECT COALESCE(SUM(v.amount_iqd),0) FROM cash_receipt_vouchers v LEFT JOIN cash_receipt_reversals r ON r.voucher_id=v.id AND r.accounting_date<=${asOf} WHERE v.accounting_date<=${asOf} AND r.id IS NULL)
          - (SELECT COALESCE(SUM(amount_iqd),0) FROM return_refund_payments WHERE collection_id IS NOT NULL AND accounting_date<=${asOf})
          - (SELECT COALESCE(SUM(a.amount_iqd),0) FROM external_driver_trip_settlement_allocations a JOIN external_driver_trips t ON t.id=a.trip_id WHERE t.accounting_date<=${asOf})
          + (SELECT COALESCE(SUM(e.amount_iqd),0) FROM custody_exceptions e LEFT JOIN custody_exception_reversals r ON r.exception_id=e.id AND r.accounting_date<=${asOf} WHERE e.type='goods_loss' AND e.liability_bearer='party' AND e.accounting_date<=${asOf} AND r.id IS NULL) AS amount
      ) SELECT COALESCE(goods.quantity,0) AS goods_quantity,COALESCE(goods.value,0) AS goods_value,COALESCE(cash.amount,0) AS cash_held FROM goods CROSS JOIN cash
    `);
    const actual = overall[0];
    const goodsLedger = ledger.get('1010') ?? ZERO;
    const cashLedger = ledger.get('1020') ?? ZERO;
    const response = {
      as_of: query.as_of,
      currency: 'IQD',
      touches_open_period: await this.touchesOpenPeriod(asOf, asOf),
      totals: {
        goods_quantity: decimal(actual.goods_quantity).toFixed(3),
        ...(canViewCost
          ? {
              goods_value: money(actual.goods_value),
              goods_ledger_balance: goodsLedger.toFixed(4),
              goods_reconciled: decimal(actual.goods_value).equals(goodsLedger),
            }
          : {}),
        cash_held: money(actual.cash_held),
        cash_ledger_balance: cashLedger.toFixed(4),
        cash_reconciled: decimal(actual.cash_held).equals(cashLedger),
      },
      pagination: this.pagination(
        page,
        perPage,
        rows.length ? integer(rows[0].total) : 0,
      ),
      data: rows.map((row) => ({
        party: { id: row.id, kind: row.kind, name: row.name },
        goods_quantity: decimal(row.goods_quantity).toFixed(3),
        ...(canViewCost ? { goods_value: money(row.goods_value) } : {}),
        cash_held: money(row.cash_held),
        oldest_goods_age_days: this.age(asOf, row.oldest_goods_at),
        oldest_cash_age_days: this.age(asOf, row.oldest_cash_at),
      })),
    };
    if (audit) await this.auditRead(actor.id, 'delivery_custody', query);
    return response;
  }

  async liabilities(actor: Actor, query: AsOfReportQueryDto, audit = true) {
    const asOf = parseBusinessDate(query.as_of);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 50;
    type Row = {
      type: string;
      entity_id: string;
      name: string;
      document_number: string | null;
      due_date: Date | null;
      amount: Value;
      ledger_backed: boolean;
      total: bigint;
    };
    const rows = await this.prisma.$queryRaw<Row[]>(Prisma.sql`
      WITH supplier AS (
        SELECT 'supplier_payable'::text AS type,s.id AS entity_id,s.name,
          NULL::text AS document_number,MIN(e.due_date) AS due_date,
          SUM(e.credit_iqd-e.debit_iqd) AS amount,TRUE AS ledger_backed
        FROM suppliers s JOIN supplier_account_entries e ON e.supplier_id=s.id
        WHERE e.accounting_date<=${asOf} GROUP BY s.id,s.name
        HAVING SUM(e.credit_iqd-e.debit_iqd)>0
      ), expense AS (
        SELECT 'accrued_expense',e.id,COALESCE(e.payee,e.description),e.document_number,e.document_date,
          e.amount_iqd-COALESCE(SUM(p.amount_iqd) FILTER (WHERE p.accounting_date<=${asOf}),0),TRUE
        FROM expenses e LEFT JOIN expense_payments p ON p.expense_id=e.id
        LEFT JOIN expense_corrections c ON c.expense_id=e.id AND c.accounting_date<=${asOf}
        WHERE e.status='posted' AND e.payment_mode='owed' AND e.accounting_date<=${asOf} AND c.id IS NULL
        GROUP BY e.id HAVING e.amount_iqd-COALESCE(SUM(p.amount_iqd) FILTER (WHERE p.accounting_date<=${asOf}),0)>0
      ), refund AS (
        SELECT 'customer_refund',r.id,r.document_number,r.document_number,r.accounting_date,
          r.cash_refund_amount-COALESCE(SUM(p.amount_iqd) FILTER (WHERE p.accounting_date<=${asOf}),0),TRUE
        FROM returns r LEFT JOIN return_refund_payments p ON p.return_id=r.id
        WHERE r.accounting_date<=${asOf} AND r.status IN ('inspected','refunded','completed')
        GROUP BY r.id HAVING r.cash_refund_amount-COALESCE(SUM(p.amount_iqd) FILTER (WHERE p.accounting_date<=${asOf}),0)>0
      ), unallocated AS (
        SELECT 'unallocated_receipt',v.id,v.document_number,v.document_number,v.document_date,
          v.amount_iqd-COALESCE(SUM(a.amount_iqd) FILTER (WHERE b.accounting_date<=${asOf}),0),FALSE
        FROM cash_receipt_vouchers v
        LEFT JOIN cash_receipt_reversals rev ON rev.voucher_id=v.id AND rev.accounting_date<=${asOf}
        LEFT JOIN cash_receipt_allocation_batches b ON b.voucher_id=v.id
        LEFT JOIN cash_receipt_allocations a ON a.batch_id=b.id
        WHERE v.accounting_date<=${asOf} AND rev.id IS NULL
        GROUP BY v.id HAVING v.amount_iqd-COALESCE(SUM(a.amount_iqd) FILTER (WHERE b.accounting_date<=${asOf}),0)>0
      ), detail AS (
        SELECT * FROM supplier UNION ALL SELECT * FROM expense UNION ALL SELECT * FROM refund UNION ALL SELECT * FROM unallocated
      ) SELECT *,COUNT(*) OVER() AS total FROM detail
      ORDER BY due_date ASC NULLS LAST,type ASC,entity_id ASC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `);
    const balances = await this.accountBalances(
      ['2000', '2010', '2020', '2030', '2040'],
      asOf,
      true,
    );
    const operational = await this.prisma.$queryRaw<
      Array<{
        supplier: Value;
        expenses: Value;
        refunds: Value;
        unallocated: Value;
        loyalty_accounts: bigint;
        loyalty_points: Value;
      }>
    >(Prisma.sql`
      WITH supplier AS (SELECT COALESCE(SUM(credit_iqd-debit_iqd),0) amount FROM supplier_account_entries WHERE accounting_date<=${asOf}),
      expenses AS (
        SELECT COALESCE(SUM(e.amount_iqd-COALESCE(p.paid,0)),0) amount FROM expenses e
        LEFT JOIN LATERAL (SELECT SUM(amount_iqd) paid FROM expense_payments WHERE expense_id=e.id AND accounting_date<=${asOf}) p ON TRUE
        LEFT JOIN expense_corrections c ON c.expense_id=e.id AND c.accounting_date<=${asOf}
        WHERE e.status='posted' AND e.payment_mode='owed' AND e.accounting_date<=${asOf} AND c.id IS NULL
      ), refunds AS (
        SELECT COALESCE(SUM(r.cash_refund_amount-COALESCE(p.paid,0)),0) amount FROM returns r
        LEFT JOIN LATERAL (SELECT SUM(amount_iqd) paid FROM return_refund_payments WHERE return_id=r.id AND accounting_date<=${asOf}) p ON TRUE
        WHERE r.accounting_date<=${asOf} AND r.status IN ('inspected','refunded','completed')
      ), unallocated AS (
        SELECT COALESCE(SUM(v.amount_iqd-COALESCE(a.allocated,0)),0) amount FROM cash_receipt_vouchers v
        LEFT JOIN cash_receipt_reversals rev ON rev.voucher_id=v.id AND rev.accounting_date<=${asOf}
        LEFT JOIN LATERAL (
          SELECT SUM(a.amount_iqd) allocated FROM cash_receipt_allocation_batches b JOIN cash_receipt_allocations a ON a.batch_id=b.id
          WHERE b.voucher_id=v.id AND b.accounting_date<=${asOf}
        ) a ON TRUE WHERE v.accounting_date<=${asOf} AND rev.id IS NULL
      ), loyalty AS (
        SELECT COUNT(*) FILTER (WHERE balance>0) accounts,COALESCE(SUM(GREATEST(balance,0)),0) points
        FROM (SELECT account_id,SUM(points) balance FROM loyalty_ledger WHERE created_at < ((${asOf}::date+interval '1 day') AT TIME ZONE 'Asia/Baghdad') GROUP BY account_id) x
      ) SELECT supplier.amount supplier,expenses.amount expenses,refunds.amount refunds,unallocated.amount unallocated,loyalty.accounts loyalty_accounts,loyalty.points loyalty_points
      FROM supplier CROSS JOIN expenses CROSS JOIN refunds CROSS JOIN unallocated CROSS JOIN loyalty
    `);
    const op = operational[0];
    const supplierLedger = balances.get('2000') ?? ZERO;
    const expenseLedger = balances.get('2040') ?? ZERO;
    const refundLedger = balances.get('2030') ?? ZERO;
    const allLedger = [...balances.values()].reduce(
      (sum, value) => sum.plus(value),
      ZERO,
    );
    const response = {
      as_of: query.as_of,
      currency: 'IQD',
      touches_open_period: await this.touchesOpenPeriod(asOf, asOf),
      totals: {
        supplier_payables: money(op.supplier),
        supplier_ledger_balance: supplierLedger.toFixed(4),
        supplier_reconciled: decimal(op.supplier).equals(supplierLedger),
        accrued_expenses: money(op.expenses),
        expense_ledger_balance: expenseLedger.toFixed(4),
        expenses_reconciled: decimal(op.expenses).equals(expenseLedger),
        customer_refunds_owed: money(op.refunds),
        refund_ledger_balance: refundLedger.toFixed(4),
        refunds_reconciled: decimal(op.refunds).equals(refundLedger),
        other_ledger_liabilities: (balances.get('2010') ?? ZERO)
          .plus(balances.get('2020') ?? ZERO)
          .toFixed(4),
        liability_ledger_total: allLedger.toFixed(4),
        unallocated_customer_receipts: money(op.unallocated),
        unallocated_receipts_ledger_valued: false,
        loyalty_accounts: integer(op.loyalty_accounts),
        loyalty_points: decimal(op.loyalty_points).toFixed(0),
        loyalty_value_iqd: null,
      },
      pagination: this.pagination(
        page,
        perPage,
        rows.length ? integer(rows[0].total) : 0,
      ),
      data: rows.map((row) => ({
        type: row.type,
        entity_id: row.entity_id,
        name: row.name,
        document_number: row.document_number,
        due_date: row.due_date ? businessDateText(row.due_date) : null,
        age_days: this.age(asOf, row.due_date),
        ageing_bucket: this.ageingBucket(this.age(asOf, row.due_date)),
        amount: money(row.amount),
        ledger_backed: row.ledger_backed,
      })),
    };
    if (audit) await this.auditRead(actor.id, 'liabilities', query);
    return response;
  }

  async inventoryValuation(
    actor: Actor,
    query: InventoryValuationQueryDto,
    audit = true,
  ) {
    const asOf = parseBusinessDate(query.as_of);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 50;
    const slowDays = query.slow_days ?? 90;
    type Row = {
      variant_id: string;
      sku: string;
      product_id: string;
      product_name_ar: string;
      product_name_en: string;
      category_id: string;
      category_name_ar: string;
      category_name_en: string;
      department_id: string;
      department_name_ar: string;
      department_name_en: string;
      warehouse_id: string;
      warehouse_name: string;
      quantity: Value;
      value: Value;
      threshold: Value;
      last_sale_date: Date | null;
      total: bigint;
    };
    const stockCte = Prisma.sql`
      WITH movement_lines AS (
        SELECT sm.batch_id,sm.to_location AS location_id,sm.quantity,sm.quantity*sm.unit_cost_iqd AS value
        FROM stock_movements sm WHERE sm.to_location IS NOT NULL
          AND sm.created_at < ((${asOf}::date+interval '1 day') AT TIME ZONE 'Asia/Baghdad')
        UNION ALL
        SELECT sm.batch_id,sm.from_location,-sm.quantity,-sm.quantity*sm.unit_cost_iqd
        FROM stock_movements sm WHERE sm.from_location IS NOT NULL
          AND sm.created_at < ((${asOf}::date+interval '1 day') AT TIME ZONE 'Asia/Baghdad')
      ), stock AS (
        SELECT b.variant_id,m.location_id,SUM(m.quantity) quantity,SUM(m.value) value
        FROM movement_lines m JOIN inventory_batches b ON b.id=m.batch_id
        GROUP BY b.variant_id,m.location_id HAVING SUM(m.quantity)<>0 OR SUM(m.value)<>0
      ), last_sales AS (
        SELECT oi.variant_id,MAX(dc.accounting_date) last_sale_date
        FROM delivery_collections dc JOIN order_items oi ON oi.order_id=dc.order_id
        WHERE dc.accounting_date<=${asOf} GROUP BY oi.variant_id
      ), settings AS (
        SELECT COALESCE((SELECT value::numeric FROM store_settings WHERE key='default_low_stock_threshold' AND value ~ '^\\d+(\\.\\d+)?$'),0) threshold
      ), valued AS (
        SELECT v.id variant_id,v.sku,p.id product_id,p.name_ar product_name_ar,p.name_en product_name_en,
          c.id category_id,c.name_ar category_name_ar,c.name_en category_name_en,
          COALESCE(parent.id,c.id) department_id,COALESCE(parent.name_ar,c.name_ar) department_name_ar,COALESCE(parent.name_en,c.name_en) department_name_en,
          w.id warehouse_id,w.name warehouse_name,SUM(s.quantity) quantity,SUM(s.value) value,
          COALESCE(v.low_stock_threshold,settings.threshold) threshold,ls.last_sale_date
        FROM stock s JOIN product_variants v ON v.id=s.variant_id JOIN products p ON p.id=v.product_id
        JOIN categories c ON c.id=p.category_id LEFT JOIN categories parent ON parent.id=c.parent_id
        JOIN warehouse_locations l ON l.id=s.location_id JOIN warehouses w ON w.id=l.warehouse_id
        LEFT JOIN last_sales ls ON ls.variant_id=v.id CROSS JOIN settings
        GROUP BY v.id,v.sku,p.id,p.name_ar,p.name_en,c.id,c.name_ar,c.name_en,parent.id,parent.name_ar,parent.name_en,w.id,w.name,settings.threshold,ls.last_sale_date
      )`;
    const rows = await this.prisma.$queryRaw<Row[]>(Prisma.sql`
      ${stockCte}
      SELECT *,COUNT(*) OVER() AS total FROM valued
      ORDER BY sku ASC,warehouse_name ASC,variant_id ASC,warehouse_id ASC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `);
    const summary = await this.prisma.$queryRaw<
      Array<{
        quantity: Value;
        value: Value;
        out_count: bigint;
        low_count: bigint;
        slow_count: bigint;
        total: bigint;
      }>
    >(Prisma.sql`
      ${stockCte}, by_variant AS (
        SELECT v.id variant_id,COALESCE(SUM(valued.quantity),0) quantity,
          COALESCE(SUM(valued.value),0) value,
          COALESCE(v.low_stock_threshold,settings.threshold) threshold,
          MAX(valued.last_sale_date) last_sale_date
        FROM product_variants v LEFT JOIN valued ON valued.variant_id=v.id
        CROSS JOIN settings
        GROUP BY v.id,v.low_stock_threshold,settings.threshold
      ) SELECT COALESCE(SUM(quantity),0) quantity,COALESCE(SUM(value),0) value,
        COUNT(*) FILTER (WHERE quantity<=0) out_count,
        COUNT(*) FILTER (WHERE quantity>0 AND quantity<=threshold) low_count,
        COUNT(*) FILTER (WHERE quantity>0 AND (last_sale_date IS NULL OR last_sale_date<${addBusinessDateDays(asOf, -slowDays)})) slow_count,
        (SELECT COUNT(*) FROM valued) total FROM by_variant
    `);
    const total = summary[0];
    const inventoryLedger =
      (await this.accountBalances(['1000'], asOf)).get('1000') ?? ZERO;
    const response = {
      as_of: query.as_of,
      slow_days: slowDays,
      currency: 'IQD',
      touches_open_period: await this.touchesOpenPeriod(asOf, asOf),
      totals: {
        quantity: decimal(total.quantity).toFixed(3),
        value: money(total.value),
        inventory_ledger_balance: inventoryLedger.toFixed(4),
        reconciled: decimal(total.value).equals(inventoryLedger),
        out_of_stock_count: integer(total.out_count),
        low_stock_count: integer(total.low_count),
        slow_moving_count: integer(total.slow_count),
      },
      pagination: this.pagination(page, perPage, integer(total.total)),
      data: rows.map((row) => ({
        variant_id: row.variant_id,
        sku: row.sku,
        product: {
          id: row.product_id,
          name_ar: row.product_name_ar,
          name_en: row.product_name_en,
        },
        category: {
          id: row.category_id,
          name_ar: row.category_name_ar,
          name_en: row.category_name_en,
        },
        department: {
          id: row.department_id,
          name_ar: row.department_name_ar,
          name_en: row.department_name_en,
        },
        warehouse: { id: row.warehouse_id, name: row.warehouse_name },
        quantity: decimal(row.quantity).toFixed(3),
        moving_average_cost: decimal(row.quantity).isZero()
          ? '0.0000'
          : decimal(row.value).div(decimal(row.quantity)).toFixed(4),
        value: money(row.value),
        stock_state: decimal(row.quantity).lte(0)
          ? 'out'
          : decimal(row.quantity).lte(decimal(row.threshold))
            ? 'low'
            : 'in',
        last_sale_date: row.last_sale_date
          ? businessDateText(row.last_sale_date)
          : null,
        slow_moving:
          decimal(row.quantity).gt(0) &&
          (!row.last_sale_date ||
            row.last_sale_date < addBusinessDateDays(asOf, -slowDays)),
      })),
    };
    if (audit) await this.auditRead(actor.id, 'inventory_valuation', query);
    return response;
  }

  async dashboard(actor: Actor) {
    const todayText = businessDateText();
    const today = parseBusinessDate(todayText);
    const monthStart = parseBusinessDate(`${todayText.slice(0, 7)}-01`);
    const canOrders =
      actor.permissions.includes('orders.view') ||
      actor.permissions.includes('reports.sales.read');
    const canCash = actor.permissions.includes('reports.cash.read');
    const canLiabilities = actor.permissions.includes(
      'reports.liabilities.read',
    );
    const canInventory = actor.permissions.includes('reports.inventory.read');
    const canProfit = actor.permissions.includes('reports.profit.read');
    const [sales, statuses, attention, stock, cash, due, profit] =
      await Promise.all([
        this.prisma.$queryRaw<
          Array<{
            today_sales: Value;
            month_sales: Value;
            today_orders: bigint;
            month_orders: bigint;
          }>
        >(Prisma.sql`
          WITH ledger AS (
            SELECT je.accounting_date,a.code,SUM(jl.credit_base-jl.debit_base) amount
            FROM journal_entries je JOIN journal_lines jl ON jl.entry_id=je.id JOIN ledger_accounts a ON a.id=jl.account_id
            WHERE je.accounting_date BETWEEN ${monthStart} AND ${today} AND a.code IN ('4000','4010','4100','4110')
            GROUP BY je.accounting_date,a.code
          ), orders AS (
            SELECT accounting_date,COUNT(*) count FROM delivery_collections WHERE accounting_date BETWEEN ${monthStart} AND ${today} GROUP BY accounting_date
          ) SELECT
            COALESCE(SUM(amount) FILTER (WHERE accounting_date=${today}),0) today_sales,
            COALESCE(SUM(amount),0) month_sales,
            COALESCE((SELECT SUM(count) FROM orders WHERE accounting_date=${today}),0)::bigint today_orders,
            COALESCE((SELECT SUM(count) FROM orders),0)::bigint month_orders FROM ledger
        `),
        this.prisma.$queryRaw<Array<{ status: string; count: bigint }>>(
          Prisma.sql`SELECT status,COUNT(*) count FROM orders GROUP BY status ORDER BY status`,
        ),
        this.prisma.$queryRaw<Array<{ waiting: bigint; late: bigint }>>(
          Prisma.sql`SELECT COUNT(*) FILTER (WHERE status='pending' AND NOT customer_contacted) waiting,COUNT(*) FILTER (WHERE late_for_acceptance AND status NOT IN ('cancelled','rejected','delivered','returned')) late FROM orders`,
        ),
        this.prisma.$queryRaw<Array<{ low: bigint }>>(Prisma.sql`
          WITH q AS (SELECT b.variant_id,SUM(bs.quantity) quantity FROM batch_stock bs JOIN inventory_batches b ON b.id=bs.batch_id GROUP BY b.variant_id),
          setting AS (SELECT COALESCE((SELECT value::numeric FROM store_settings WHERE key='default_low_stock_threshold' AND value ~ '^\\d+(\\.\\d+)?$'),0) threshold)
          SELECT COUNT(*) low FROM product_variants v LEFT JOIN q ON q.variant_id=v.id CROSS JOIN setting WHERE COALESCE(q.quantity,0)<=COALESCE(v.low_stock_threshold,setting.threshold)
        `),
        this.prisma.$queryRaw<
          Array<{ id: string; name: string; balance: Value }>
        >(Prisma.sql`
          SELECT ca.id,ca.name,COALESCE(SUM(CASE WHEN je.id IS NULL THEN 0 ELSE jl.debit_base-jl.credit_base END),0) balance FROM cash_accounts ca
          LEFT JOIN journal_lines jl ON jl.account_id=ca.ledger_account_id LEFT JOIN journal_entries je ON je.id=jl.entry_id AND je.accounting_date<=${today}
          GROUP BY ca.id,ca.name ORDER BY ca.name,ca.id
        `),
        this.prisma.$queryRaw<Array<{ amount: Value }>>(Prisma.sql`
          SELECT COALESCE(SUM(GREATEST(i.total_cost-COALESCE(p.paid,0)-COALESCE(c.credit,0)-COALESCE(r.returned,0),0)*i.exchange_rate),0) amount
          FROM purchase_invoices i
          LEFT JOIN LATERAL (SELECT SUM(amount_invoice_currency) paid FROM supplier_payment_allocations WHERE invoice_id=i.id) p ON TRUE
          LEFT JOIN LATERAL (SELECT SUM(amount_invoice_currency) credit FROM supplier_credit_allocations WHERE invoice_id=i.id) c ON TRUE
          LEFT JOIN LATERAL (SELECT SUM(total_currency) returned FROM supplier_returns WHERE invoice_id=i.id) r ON TRUE
          WHERE i.due_date BETWEEN ${today} AND ${addBusinessDateDays(today, 7)}
        `),
        this.prisma.$queryRaw<Array<{ gross_profit: Value }>>(Prisma.sql`
          SELECT COALESCE(SUM(CASE WHEN a.code IN ('4000','4010','5000') THEN jl.credit_base-jl.debit_base WHEN a.code IN ('4100','4110') THEN jl.credit_base-jl.debit_base ELSE 0 END),0) gross_profit
          FROM journal_entries je JOIN journal_lines jl ON jl.entry_id=je.id JOIN ledger_accounts a ON a.id=jl.account_id
          WHERE je.accounting_date BETWEEN ${monthStart} AND ${today} AND a.code IN ('4000','4010','4100','4110','5000')
        `),
      ]);
    const response = {
      business_date: todayText,
      currency: 'IQD',
      ...(canOrders
        ? {
            sales: {
              today_net_sales: money(sales[0].today_sales),
              today_order_count: integer(sales[0].today_orders),
              month_to_date_net_sales: money(sales[0].month_sales),
              month_to_date_order_count: integer(sales[0].month_orders),
              ...(canProfit
                ? { month_to_date_gross_profit: money(profit[0].gross_profit) }
                : {}),
            },
            orders_by_status: statuses.map((row) => ({
              status: row.status,
              count: integer(row.count),
            })),
            orders_waiting_confirmation_call: integer(attention[0].waiting),
            late_orders: integer(attention[0].late),
          }
        : {}),
      ...(canInventory ? { low_stock_count: integer(stock[0].low) } : {}),
      ...(canCash
        ? {
            cash_on_hand: cash.map((row) => ({
              id: row.id,
              name: row.name,
              balance: money(row.balance),
            })),
          }
        : {}),
      ...(canLiabilities
        ? { payables_due_next_7_days: money(due[0].amount) }
        : {}),
    };
    if (canProfit) {
      await this.auditRead(actor.id, 'dashboard_profit', {
        business_date: todayText,
      });
    }
    return response;
  }

  private cashRow(
    row: Record<string, Value> & {
      id: string;
      name: string;
      kind: string;
      currency_code: string;
    },
  ) {
    const opening = decimal(row.opening);
    const inflows = decimal(row.inflows);
    const outflows = decimal(row.outflows);
    const source = (name: string) => ({
      inflows: money(row[`${name}_in`]),
      outflows: money(row[`${name}_out`]),
    });
    return {
      cash_account: {
        id: row.id,
        name: row.name,
        kind: row.kind,
        currency: row.currency_code,
      },
      opening_balance: opening.toFixed(4),
      inflows: inflows.toFixed(4),
      outflows: outflows.toFixed(4),
      closing_balance: opening.plus(inflows).minus(outflows).toFixed(4),
      sources: {
        customer_receipts: source('customer_receipts'),
        supplier_payments: source('supplier_payments'),
        expense_payments: source('expense_payments'),
        refunds: source('refunds'),
        transfers: source('transfers'),
        corrections: source('corrections'),
        other: source('other'),
      },
    };
  }

  private range(fromText: string, toText: string) {
    const from = parseBusinessDate(fromText);
    const to = parseBusinessDate(toText);
    if (from > to) throw reportError('from must be on or before to');
    return { from, to };
  }

  private pagination(page: number, perPage: number, total: number) {
    return {
      page,
      per_page: perPage,
      total,
      pages: Math.ceil(total / perPage),
    };
  }

  private age(asOf: Date, date: Date | null): number | null {
    if (!date) return null;
    return Math.max(
      0,
      Math.round((asOf.getTime() - date.getTime()) / 86_400_000),
    );
  }

  private ageingBucket(age: number | null) {
    if (age === null) return 'no_due_date';
    if (age === 0) return 'current';
    if (age <= 30) return '1_30';
    if (age <= 60) return '31_60';
    if (age <= 90) return '61_90';
    return '90_plus';
  }

  private async accountBalances(
    codes: string[],
    asOf: Date,
    creditNormal = false,
  ) {
    const rows = await this.prisma.$queryRaw<
      Array<{ code: string; balance: Value }>
    >(Prisma.sql`
      SELECT a.code,COALESCE(SUM(CASE WHEN je.id IS NULL THEN 0 ELSE ${creditNormal ? Prisma.sql`jl.credit_base-jl.debit_base` : Prisma.sql`jl.debit_base-jl.credit_base`} END),0) balance
      FROM ledger_accounts a LEFT JOIN journal_lines jl ON jl.account_id=a.id
      LEFT JOIN journal_entries je ON je.id=jl.entry_id AND je.accounting_date<=${asOf}
      WHERE a.code IN (${Prisma.join(codes)}) GROUP BY a.code
    `);
    return new Map(rows.map((row) => [row.code, decimal(row.balance)]));
  }

  private async touchesOpenPeriod(from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<Array<{ touches: boolean }>>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1
          FROM generate_series(
            date_trunc('month',${from}::date),
            date_trunc('month',${to}::date),
            interval '1 month'
          ) AS months(month_start)
          LEFT JOIN accounting_periods period
            ON period.month=months.month_start::date
          WHERE COALESCE(period.status,'open')<>'closed'
        ) touches
      `,
    );
    return rows[0]?.touches ?? true;
  }

  private auditRead(actorId: string, report: string, parameters: object) {
    return this.audit.record(this.prisma, {
      actorId,
      action: 'report.read',
      entityType: 'report',
      after: JSON.parse(
        JSON.stringify({ report, parameters }),
      ) as Prisma.InputJsonObject,
    });
  }
}
