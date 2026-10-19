import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { parseBusinessDate } from '../finance/business-date';
import type {
  ExpenseReportQueryDto,
  PurchasesReportQueryDto,
  StockMovementReportQueryDto,
  SupplierStatementQueryDto,
} from './reports.dto';

type Actor = { id: string; permissions: string[] };
type Value = Prisma.Decimal | bigint | number | string | null;
const ZERO = new Prisma.Decimal(0);

function decimal(value: Value) {
  return value === null ? ZERO : new Prisma.Decimal(value.toString());
}

function amount(value: Value) {
  return decimal(value).toFixed(4);
}

function quantity(value: Value) {
  return decimal(value).toFixed(3);
}

function count(value: bigint | number | null) {
  return Number(value ?? 0);
}

function invalid(message: string) {
  return new UnprocessableEntityException({
    status: 422,
    code: 'REPORT_PARAMETERS_INVALID',
    message,
    errors: [],
  });
}

@Injectable()
export class ReportsPart3Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async purchases(actor: Actor, query: PurchasesReportQueryDto, audit = true) {
    const range = this.range(query.from, query.to);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 50;
    const group = query.group_by ?? 'period';
    const dimension = this.purchaseDimension(group);
    const filters = Prisma.sql`
      AND (${query.supplier_id ?? null}::uuid IS NULL OR supplier_id=${query.supplier_id ?? null}::uuid)
      AND (${query.variant_id ?? null}::uuid IS NULL OR variant_id=${query.variant_id ?? null}::uuid)
      AND (${query.category_id ?? null}::uuid IS NULL OR category_id=${query.category_id ?? null}::uuid)
    `;
    type Row = {
      group_id: string;
      name_ar: string;
      name_en: string;
      purchased_quantity: Value;
      returned_quantity: Value;
      goods_cost_iqd: Value;
      landed_cost_iqd: Value;
      returns_iqd: Value;
      document_count: bigint;
    };
    const base = Prisma.sql`
      WITH events AS MATERIALIZED (
        SELECT i.accounting_date event_date,i.id document_id,'purchase' event_kind,
          i.supplier_id,s.name supplier_name,pi.variant_id,v.sku,p.category_id,
          c.name_ar category_ar,c.name_en category_en,
          pi.quantity purchased_quantity,0::numeric returned_quantity,
          pi.line_total_currency*i.exchange_rate goods_cost_iqd,
          pi.landed_cost_share_iqd landed_cost_iqd,0::numeric returns_iqd
        FROM purchase_invoices i
        JOIN suppliers s ON s.id=i.supplier_id
        JOIN purchase_invoice_items pi ON pi.invoice_id=i.id
        JOIN product_variants v ON v.id=pi.variant_id
        JOIN products p ON p.id=pi.product_id
        JOIN categories c ON c.id=p.category_id
        WHERE i.status='posted' AND i.accounting_date BETWEEN ${range.from} AND ${range.to}
        UNION ALL
        SELECT r.accounting_date,r.id,'return',r.supplier_id,s.name,pi.variant_id,v.sku,
          p.category_id,c.name_ar,c.name_en,0::numeric,rl.quantity,
          0::numeric,0::numeric,rl.amount_iqd
        FROM supplier_returns r
        JOIN suppliers s ON s.id=r.supplier_id
        JOIN supplier_return_lines rl ON rl.return_id=r.id
        JOIN purchase_invoice_items pi ON pi.id=rl.purchase_item_id
        JOIN product_variants v ON v.id=pi.variant_id
        JOIN products p ON p.id=pi.product_id
        JOIN categories c ON c.id=p.category_id
        WHERE r.accounting_date BETWEEN ${range.from} AND ${range.to}
      ), grouped AS MATERIALIZED (
        SELECT ${dimension.id}::text group_id,${dimension.ar}::text name_ar,
          ${dimension.en}::text name_en,
          SUM(purchased_quantity) purchased_quantity,
          SUM(returned_quantity) returned_quantity,
          SUM(goods_cost_iqd) goods_cost_iqd,
          SUM(landed_cost_iqd) landed_cost_iqd,
          SUM(returns_iqd) returns_iqd,
          COUNT(DISTINCT document_id) document_count
        FROM events WHERE TRUE ${filters}
        GROUP BY ${dimension.id},${dimension.ar},${dimension.en}
      )
    `;
    const [rows, totalRows] = await Promise.all([
      this.prisma.$queryRaw<Row[]>(Prisma.sql`${base}
        SELECT * FROM grouped ORDER BY group_id ASC
        LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`),
      this.prisma.$queryRaw<
        Array<{
          groups: bigint;
          purchased_quantity: Value;
          returned_quantity: Value;
          goods_cost_iqd: Value;
          landed_cost_iqd: Value;
          returns_iqd: Value;
          document_count: bigint;
        }>
      >(Prisma.sql`${base}
        SELECT COUNT(*) groups,COALESCE(SUM(purchased_quantity),0) purchased_quantity,
          COALESCE(SUM(returned_quantity),0) returned_quantity,
          COALESCE(SUM(goods_cost_iqd),0) goods_cost_iqd,
          COALESCE(SUM(landed_cost_iqd),0) landed_cost_iqd,
          COALESCE(SUM(returns_iqd),0) returns_iqd,
          COALESCE(SUM(document_count),0) document_count FROM grouped`),
    ]);
    const totals = totalRows[0];
    const response = {
      from: query.from,
      to: query.to,
      group_by: group,
      currency: 'IQD',
      touches_open_period: await this.touchesOpenPeriod(range.from, range.to),
      totals: this.purchaseAmounts(totals),
      pagination: this.pagination(page, perPage, count(totals.groups)),
      data: rows.map((row) => ({
        group_id: row.group_id,
        name_ar: row.name_ar,
        name_en: row.name_en,
        ...this.purchaseAmounts(row),
        drilldown: {
          report: 'purchases',
          group_by: group,
          group_id: row.group_id,
          from: query.from,
          to: query.to,
        },
      })),
    };
    if (audit) await this.auditRead(actor.id, 'purchases', query);
    return response;
  }

  async supplierStatement(
    actor: Actor,
    query: SupplierStatementQueryDto,
    audit = true,
  ) {
    const asOf = parseBusinessDate(query.as_of);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 50;
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: query.supplier_id },
      select: { id: true, name: true },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    type Entry = {
      id: string;
      source_type: string;
      source_id: string;
      document_number: string;
      document_date: Date;
      accounting_date: Date;
      currency_code: string;
      debit_currency: Value;
      credit_currency: Value;
      debit_iqd: Value;
      credit_iqd: Value;
    };
    const [entries, summary, fx, payable] = await Promise.all([
      this.prisma.$queryRaw<Entry[]>(Prisma.sql`
        SELECT id,source_type,source_id,document_number,document_date,accounting_date,
          currency_code,debit_currency,credit_currency,debit_iqd,credit_iqd
        FROM supplier_account_entries
        WHERE supplier_id=${query.supplier_id}::uuid AND accounting_date<=${asOf}
        ORDER BY accounting_date DESC,id DESC
        LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`),
      this.prisma.$queryRaw<
        Array<{
          total: bigint;
          opening: Value;
          invoices: Value;
          payments: Value;
          credits: Value;
          returns: Value;
          closing: Value;
        }>
      >(Prisma.sql`
        SELECT COUNT(*) total,
          COALESCE(SUM(credit_iqd-debit_iqd) FILTER (WHERE source_type='opening_balance'),0) opening,
          COALESCE(SUM(credit_iqd-debit_iqd) FILTER (WHERE source_type='purchase_invoice'),0) invoices,
          COALESCE(SUM(debit_iqd-credit_iqd) FILTER (WHERE source_type IN ('payment','payment_allocation')),0) payments,
          COALESCE(SUM(debit_iqd-credit_iqd) FILTER (WHERE source_type='payment_credit'),0) credits,
          COALESCE(SUM(debit_iqd-credit_iqd) FILTER (WHERE source_type='supplier_return'),0) returns,
          COALESCE(SUM(credit_iqd-debit_iqd),0) closing
        FROM supplier_account_entries
        WHERE supplier_id=${query.supplier_id}::uuid AND accounting_date<=${asOf}`),
      this.prisma.$queryRaw<Array<{ amount: Value }>>(Prisma.sql`
        SELECT COALESCE(SUM(a.fx_difference_iqd),0) amount
        FROM supplier_payment_allocations a
        JOIN supplier_payments p ON p.id=a.payment_id
        WHERE p.supplier_id=${query.supplier_id}::uuid AND p.accounting_date<=${asOf}`),
      this.prisma.$queryRaw<Array<{ amount: Value }>>(Prisma.sql`
        SELECT COALESCE(SUM(jl.credit_base-jl.debit_base),0) amount
        FROM journal_entries je JOIN journal_lines jl ON jl.entry_id=je.id
        JOIN ledger_accounts account ON account.id=jl.account_id AND account.code='2000'
        WHERE je.accounting_date<=${asOf} AND (
          je.source_id IN (
            SELECT source_id FROM supplier_account_entries
            WHERE supplier_id=${query.supplier_id}::uuid AND accounting_date<=${asOf}
          ) OR je.source_id IN (
            SELECT id FROM supplier_payments
            WHERE supplier_id=${query.supplier_id}::uuid AND accounting_date<=${asOf}
          )
        )`),
    ]);
    const totals = summary[0];
    const response = {
      as_of: query.as_of,
      currency: 'IQD',
      touches_open_period: await this.touchesOpenPeriod(asOf, asOf),
      supplier,
      totals: {
        opening_balance: amount(totals.opening),
        invoices: amount(totals.invoices),
        payments: amount(totals.payments),
        credits: amount(totals.credits),
        fx_differences: amount(fx[0].amount),
        returns: amount(totals.returns),
        closing_balance: amount(totals.closing),
      },
      reconciliation: {
        supplier_subledger_iqd: amount(totals.closing),
        accounts_payable_iqd: amount(payable[0].amount),
        difference_iqd: decimal(totals.closing)
          .minus(decimal(payable[0].amount))
          .toFixed(4),
      },
      pagination: this.pagination(page, perPage, count(totals.total)),
      data: entries.map((row) => ({
        id: row.id,
        source_type: row.source_type,
        source_id: row.source_id,
        document_number: row.document_number,
        document_date: row.document_date,
        accounting_date: row.accounting_date,
        currency: row.currency_code,
        debit_currency: amount(row.debit_currency),
        credit_currency: amount(row.credit_currency),
        debit_iqd: amount(row.debit_iqd),
        credit_iqd: amount(row.credit_iqd),
        drilldown: {
          resource: row.source_type,
          id: row.source_id,
        },
      })),
    };
    if (audit) await this.auditRead(actor.id, 'supplier_statement', query);
    return response;
  }

  async stockMovement(
    actor: Actor,
    query: StockMovementReportQueryDto,
    audit = true,
  ) {
    const range = this.range(query.from, query.to);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 50;
    const warehouse = query.warehouse_id ?? null;
    const variant = query.variant_id ?? null;
    type Row = {
      variant_id: string;
      sku: string;
      product_ar: string;
      product_en: string;
      warehouse_id: string;
      warehouse: string;
      opening_qty: Value;
      opening_value: Value;
      receipts_qty: Value;
      receipts_value: Value;
      sales_qty: Value;
      sales_value: Value;
      returns_qty: Value;
      returns_value: Value;
      transfers_qty: Value;
      transfers_value: Value;
      counts_write_downs_qty: Value;
      counts_write_downs_value: Value;
      closing_qty: Value;
      closing_value: Value;
    };
    const base = Prisma.sql`
      WITH movement_events AS MATERIALIZED (
        SELECT m.id,(m.created_at AT TIME ZONE 'Asia/Baghdad')::date event_date,
          m.type,m.source_type,m.source_id,b.variant_id,
          source.warehouse_id,-m.quantity quantity,-m.quantity*m.unit_cost_iqd value_iqd
        FROM stock_movements m JOIN inventory_batches b ON b.id=m.batch_id
        JOIN warehouse_locations source ON source.id=m.from_location
        WHERE (m.created_at AT TIME ZONE 'Asia/Baghdad')::date <= ${range.to}
        UNION ALL
        SELECT m.id,(m.created_at AT TIME ZONE 'Asia/Baghdad')::date event_date,
          m.type,m.source_type,m.source_id,b.variant_id,
          destination.warehouse_id,m.quantity,m.quantity*m.unit_cost_iqd
        FROM stock_movements m JOIN inventory_batches b ON b.id=m.batch_id
        JOIN warehouse_locations destination ON destination.id=m.to_location
        WHERE (m.created_at AT TIME ZONE 'Asia/Baghdad')::date <= ${range.to}
      ), grouped AS MATERIALIZED (
        SELECT e.variant_id,v.sku,p.name_ar product_ar,p.name_en product_en,
          e.warehouse_id,w.name warehouse,
          COALESCE(SUM(quantity) FILTER (WHERE event_date < ${range.from}),0) opening_qty,
          COALESCE(SUM(value_iqd) FILTER (WHERE event_date < ${range.from}),0) opening_value,
          COALESCE(SUM(quantity) FILTER (WHERE event_date >= ${range.from} AND type='receive'),0) receipts_qty,
          COALESCE(SUM(value_iqd) FILTER (WHERE event_date >= ${range.from} AND type='receive'),0) receipts_value,
          COALESCE(-SUM(quantity) FILTER (WHERE event_date >= ${range.from} AND type IN ('issue','issue_to_custody','custody_to_sold')),0) sales_qty,
          COALESCE(-SUM(value_iqd) FILTER (WHERE event_date >= ${range.from} AND type IN ('issue','issue_to_custody','custody_to_sold')),0) sales_value,
          COALESCE(SUM(quantity) FILTER (WHERE event_date >= ${range.from} AND type IN ('return_in','return_against_uncollected')),0) returns_qty,
          COALESCE(SUM(value_iqd) FILTER (WHERE event_date >= ${range.from} AND type IN ('return_in','return_against_uncollected')),0) returns_value,
          COALESCE(SUM(quantity) FILTER (WHERE event_date >= ${range.from} AND type='transfer'),0) transfers_qty,
          COALESCE(SUM(value_iqd) FILTER (WHERE event_date >= ${range.from} AND type='transfer'),0) transfers_value,
          COALESCE(SUM(quantity) FILTER (WHERE event_date >= ${range.from} AND (type IN ('adjust','write_down') OR source_type IN ('stock_count','inventory_write_down'))),0) counts_write_downs_qty,
          COALESCE(SUM(value_iqd) FILTER (WHERE event_date >= ${range.from} AND (type IN ('adjust','write_down') OR source_type IN ('stock_count','inventory_write_down'))),0) counts_write_downs_value,
          COALESCE(SUM(quantity),0) closing_qty,COALESCE(SUM(value_iqd),0) closing_value
        FROM movement_events e
        JOIN product_variants v ON v.id=e.variant_id JOIN products p ON p.id=v.product_id
        JOIN warehouses w ON w.id=e.warehouse_id
        WHERE (${warehouse}::uuid IS NULL OR e.warehouse_id=${warehouse}::uuid)
          AND (${variant}::uuid IS NULL OR e.variant_id=${variant}::uuid)
        GROUP BY e.variant_id,v.sku,p.name_ar,p.name_en,e.warehouse_id,w.name
      )
    `;
    const [rows, totalsRows] = await Promise.all([
      this.prisma.$queryRaw<Row[]>(Prisma.sql`${base} SELECT * FROM grouped
        ORDER BY sku ASC,warehouse ASC,variant_id ASC,warehouse_id ASC
        LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`),
      this.prisma.$queryRaw<Array<Row & { total: bigint }>>(Prisma.sql`${base}
        SELECT NULL::uuid variant_id,'' sku,'' product_ar,'' product_en,NULL::uuid warehouse_id,'' warehouse,
          COALESCE(SUM(opening_qty),0) opening_qty,COALESCE(SUM(opening_value),0) opening_value,
          COALESCE(SUM(receipts_qty),0) receipts_qty,COALESCE(SUM(receipts_value),0) receipts_value,
          COALESCE(SUM(sales_qty),0) sales_qty,COALESCE(SUM(sales_value),0) sales_value,
          COALESCE(SUM(returns_qty),0) returns_qty,COALESCE(SUM(returns_value),0) returns_value,
          COALESCE(SUM(transfers_qty),0) transfers_qty,COALESCE(SUM(transfers_value),0) transfers_value,
          COALESCE(SUM(counts_write_downs_qty),0) counts_write_downs_qty,
          COALESCE(SUM(counts_write_downs_value),0) counts_write_downs_value,
          COALESCE(SUM(closing_qty),0) closing_qty,COALESCE(SUM(closing_value),0) closing_value,
          COUNT(*) total FROM grouped`),
    ]);
    const totals = totalsRows[0];
    const response = {
      from: query.from,
      to: query.to,
      currency: 'IQD',
      touches_open_period: await this.touchesOpenPeriod(range.from, range.to),
      totals: this.stockAmounts(totals),
      pagination: this.pagination(page, perPage, count(totals.total)),
      data: rows.map((row) => ({
        variant_id: row.variant_id,
        sku: row.sku,
        product: { name_ar: row.product_ar, name_en: row.product_en },
        warehouse: { id: row.warehouse_id, name: row.warehouse },
        ...this.stockAmounts(row),
        drilldown: {
          resource: 'stock_movements',
          variant_id: row.variant_id,
          warehouse_id: row.warehouse_id,
          from: query.from,
          to: query.to,
        },
      })),
    };
    if (audit) await this.auditRead(actor.id, 'stock_movement', query);
    return response;
  }

  async expenses(actor: Actor, query: ExpenseReportQueryDto, audit = true) {
    const range = this.range(query.from, query.to);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 50;
    const group = query.group_by ?? 'category';
    const dimension = this.expenseDimension(group);
    type Row = {
      group_id: string;
      name_ar: string;
      name_en: string;
      immediate_iqd: Value;
      prepaid_amortisation_iqd: Value;
      corrections_iqd: Value;
      total_iqd: Value;
      document_count: bigint;
    };
    const base = Prisma.sql`
      WITH recognized AS MATERIALIZED (
        SELECT je.id journal_id,je.accounting_date,je.source_type,jl.debit_base-jl.credit_base amount_iqd,
          ec.id category_id,ec.name_ar category_ar,ec.name_en category_en,
          COALESCE(direct.id,scheduled.id,corrected.id) expense_id,
          COALESCE(direct.payee,scheduled.payee,corrected.payee,'') payee
        FROM journal_entries je JOIN journal_lines jl ON jl.entry_id=je.id
        LEFT JOIN expenses direct ON je.source_type='expense' AND direct.id=je.source_id
        LEFT JOIN expense_schedule_installments installment ON installment.journal_entry_id=je.id
        LEFT JOIN expense_schedules schedule ON schedule.id=installment.schedule_id
        LEFT JOIN expenses scheduled ON scheduled.id=schedule.expense_id
        LEFT JOIN expense_correction_postings posting
          ON posting.reversal_journal_entry_id=je.id AND posting.role='expense'
        LEFT JOIN expense_corrections correction ON correction.id=posting.correction_id
        LEFT JOIN expenses corrected ON corrected.id=correction.expense_id
        JOIN expense_categories ec
          ON ec.id=COALESCE(direct.category_id,scheduled.category_id,corrected.category_id)
         AND ec.ledger_account_id=jl.account_id
        WHERE je.accounting_date BETWEEN ${range.from} AND ${range.to}
          AND COALESCE(direct.id,scheduled.id,corrected.id) IS NOT NULL
          AND (${query.category_id ?? null}::uuid IS NULL OR ec.id=${query.category_id ?? null}::uuid)
          AND (${query.payee ?? null}::text IS NULL OR COALESCE(direct.payee,scheduled.payee,corrected.payee,'') ILIKE '%'||${query.payee ?? null}::text||'%')
      ), grouped AS MATERIALIZED (
        SELECT ${dimension.id}::text group_id,${dimension.ar}::text name_ar,${dimension.en}::text name_en,
          COALESCE(SUM(amount_iqd) FILTER (WHERE source_type='expense'),0) immediate_iqd,
          COALESCE(SUM(amount_iqd) FILTER (WHERE source_type='expense_prepaid_amortization'),0) prepaid_amortisation_iqd,
          COALESCE(SUM(amount_iqd) FILTER (WHERE source_type='expense_correction'),0) corrections_iqd,
          COALESCE(SUM(amount_iqd),0) total_iqd,COUNT(DISTINCT expense_id) document_count
        FROM recognized GROUP BY ${dimension.id},${dimension.ar},${dimension.en}
      )
    `;
    const [rows, totalsRows] = await Promise.all([
      this.prisma.$queryRaw<Row[]>(Prisma.sql`${base} SELECT * FROM grouped
        ORDER BY group_id ASC LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`),
      this.prisma.$queryRaw<Array<Row & { total: bigint }>>(Prisma.sql`${base}
        SELECT '' group_id,'' name_ar,'' name_en,
          COALESCE(SUM(immediate_iqd),0) immediate_iqd,
          COALESCE(SUM(prepaid_amortisation_iqd),0) prepaid_amortisation_iqd,
          COALESCE(SUM(corrections_iqd),0) corrections_iqd,
          COALESCE(SUM(total_iqd),0) total_iqd,
          COALESCE(SUM(document_count),0) document_count,COUNT(*) total FROM grouped`),
    ]);
    const totals = totalsRows[0];
    const expenseAmounts = (row: Row) => ({
      immediate_iqd: amount(row.immediate_iqd),
      prepaid_amortisation_iqd: amount(row.prepaid_amortisation_iqd),
      corrections_iqd: amount(row.corrections_iqd),
      total_iqd: amount(row.total_iqd),
      document_count: count(row.document_count),
    });
    const response = {
      from: query.from,
      to: query.to,
      group_by: group,
      currency: 'IQD',
      touches_open_period: await this.touchesOpenPeriod(range.from, range.to),
      totals: expenseAmounts(totals),
      pagination: this.pagination(page, perPage, count(totals.total)),
      data: rows.map((row) => ({
        group_id: row.group_id,
        name_ar: row.name_ar,
        name_en: row.name_en,
        ...expenseAmounts(row),
        drilldown: {
          resource: 'expenses',
          group_by: group,
          group_id: row.group_id,
          from: query.from,
          to: query.to,
        },
      })),
    };
    if (audit) await this.auditRead(actor.id, 'expenses', query);
    return response;
  }

  private purchaseDimension(
    group: NonNullable<PurchasesReportQueryDto['group_by']>,
  ) {
    if (group === 'supplier') {
      return {
        id: Prisma.sql`supplier_id`,
        ar: Prisma.sql`supplier_name`,
        en: Prisma.sql`supplier_name`,
      };
    }
    if (group === 'sku') {
      return {
        id: Prisma.sql`variant_id`,
        ar: Prisma.sql`sku`,
        en: Prisma.sql`sku`,
      };
    }
    if (group === 'category') {
      return {
        id: Prisma.sql`category_id`,
        ar: Prisma.sql`category_ar`,
        en: Prisma.sql`category_en`,
      };
    }
    return {
      id: Prisma.sql`event_date`,
      ar: Prisma.sql`event_date::text`,
      en: Prisma.sql`event_date::text`,
    };
  }

  private expenseDimension(
    group: NonNullable<ExpenseReportQueryDto['group_by']>,
  ) {
    if (group === 'payee') {
      return {
        id: Prisma.sql`payee`,
        ar: Prisma.sql`payee`,
        en: Prisma.sql`payee`,
      };
    }
    if (group === 'month') {
      return {
        id: Prisma.sql`to_char(accounting_date,'YYYY-MM')`,
        ar: Prisma.sql`to_char(accounting_date,'YYYY-MM')`,
        en: Prisma.sql`to_char(accounting_date,'YYYY-MM')`,
      };
    }
    return {
      id: Prisma.sql`category_id`,
      ar: Prisma.sql`category_ar`,
      en: Prisma.sql`category_en`,
    };
  }

  private purchaseAmounts(row: {
    purchased_quantity: Value;
    returned_quantity: Value;
    goods_cost_iqd: Value;
    landed_cost_iqd: Value;
    returns_iqd: Value;
    document_count: bigint;
  }) {
    const purchaseCost = decimal(row.goods_cost_iqd).plus(
      decimal(row.landed_cost_iqd),
    );
    return {
      purchased_quantity: quantity(row.purchased_quantity),
      returned_quantity: quantity(row.returned_quantity),
      net_quantity: decimal(row.purchased_quantity)
        .minus(decimal(row.returned_quantity))
        .toFixed(3),
      goods_cost_iqd: amount(row.goods_cost_iqd),
      landed_cost_iqd: amount(row.landed_cost_iqd),
      purchase_cost_iqd: purchaseCost.toFixed(4),
      returns_iqd: amount(row.returns_iqd),
      net_cost_iqd: purchaseCost.minus(decimal(row.returns_iqd)).toFixed(4),
      document_count: count(row.document_count),
    };
  }

  private stockAmounts(row: RowStock) {
    const keys = [
      'opening',
      'receipts',
      'sales',
      'returns',
      'transfers',
      'counts_write_downs',
      'closing',
    ] as const;
    return Object.fromEntries(
      keys.flatMap((key) => [
        [`${key}_quantity`, quantity(row[`${key}_qty`])],
        [`${key}_value_iqd`, amount(row[`${key}_value`])],
      ]),
    );
  }

  private range(fromText: string, toText: string) {
    const from = parseBusinessDate(fromText);
    const to = parseBusinessDate(toText);
    if (from > to) throw invalid('from must be on or before to');
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

  private async touchesOpenPeriod(from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<
      Array<{ touches: boolean }>
    >(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM generate_series(date_trunc('month',${from}::date),
          date_trunc('month',${to}::date),interval '1 month') months(month_start)
        LEFT JOIN accounting_periods period ON period.month=months.month_start::date
        WHERE COALESCE(period.status,'open')<>'closed'
      ) touches`);
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

type RowStock = Record<
  | 'opening_qty'
  | 'opening_value'
  | 'receipts_qty'
  | 'receipts_value'
  | 'sales_qty'
  | 'sales_value'
  | 'returns_qty'
  | 'returns_value'
  | 'transfers_qty'
  | 'transfers_value'
  | 'counts_write_downs_qty'
  | 'counts_write_downs_value'
  | 'closing_qty'
  | 'closing_value',
  Value
>;
