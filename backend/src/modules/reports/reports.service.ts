import {
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
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
  ProfitabilityReportQueryDto,
  ProfitGroup,
  ProfitLossQueryDto,
  SalesGroup,
  SalesReportQueryDto,
} from './reports.dto';

type Actor = { id: string; permissions: string[] };
type Value = Prisma.Decimal | bigint | number | string | null;

type GroupRow = {
  group_key: string;
  name_ar: string;
  name_en: string;
  gross_sales: Value;
  tier_discounts: Value;
  coupon_discounts: Value;
  other_discounts: Value;
  returns: Value;
  net_sales: Value;
  order_count: bigint;
  total_groups: bigint;
};

type ProfitRow = GroupRow & {
  cost_of_goods_sold: Value;
  return_cost_reversals: Value;
  inventory_write_downs: Value;
};

const ZERO = new Prisma.Decimal(0);

function decimal(value: Value): Prisma.Decimal {
  return value === null ? ZERO : new Prisma.Decimal(value.toString());
}

function money(value: Value): string {
  return decimal(value).toFixed(4);
}

function count(value: bigint | number): number {
  return Number(value);
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
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async sales(actor: Actor, query: SalesReportQueryDto, audit = false) {
    // The sales route existed as an optional-range contract before phase 12.
    // Preserve that shape: an omitted side uses the other side, and an entirely
    // omitted range means the current Baghdad business day.
    const today = businessDateText();
    const fromText = query.from ?? query.to ?? today;
    const toText = query.to ?? query.from ?? today;
    const range = this.range(fromText, toText);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 50;
    const group = query.group_by ?? 'day';
    const dimension = this.dimension(group);
    const order = this.order(query.sort, query.direction);
    const rows = await this.prisma.$queryRaw<GroupRow[]>(Prisma.sql`
      WITH activity AS (
        SELECT
          ${dimension.key} AS group_key,
          ${dimension.ar} AS name_ar,
          ${dimension.en} AS name_en,
          oi.line_total AS gross_sales,
          oi.tier_discount_share AS tier_discounts,
          oi.coupon_discount_share AS coupon_discounts,
          GREATEST(oi.line_total - oi.net_paid_total - oi.tier_discount_share - oi.coupon_discount_share, 0) AS other_discounts,
          0::numeric AS returns,
          oi.net_paid_total AS net_sales,
          o.id AS order_id,
          TRUE AS sale_order
        FROM delivery_collections dc
        JOIN journal_entries posted ON posted.id = dc.delivery_journal_entry_id
        JOIN orders o ON o.id = dc.order_id
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products product ON product.id = oi.product_id
        JOIN product_variants variant ON variant.id = oi.variant_id
        JOIN categories category ON category.id = product.category_id
        LEFT JOIN categories parent ON parent.id = category.parent_id
        LEFT JOIN brands brand ON brand.id = product.brand_id
        WHERE dc.accounting_date BETWEEN ${range.from} AND ${range.to}

        UNION ALL

        SELECT
          ${dimension.returnKey} AS group_key,
          ${dimension.returnAr} AS name_ar,
          ${dimension.returnEn} AS name_en,
          0::numeric,
          0::numeric,
          0::numeric,
          0::numeric,
          ri.approved_refund,
          -ri.approved_refund,
          r.order_id,
          FALSE
        FROM returns r
        JOIN return_items ri ON ri.return_id = r.id AND ri.approved_quantity > 0
        JOIN order_items oi ON oi.id = ri.order_item_id
        JOIN products product ON product.id = oi.product_id
        JOIN product_variants variant ON variant.id = oi.variant_id
        JOIN categories category ON category.id = product.category_id
        LEFT JOIN categories parent ON parent.id = category.parent_id
        LEFT JOIN brands brand ON brand.id = product.brand_id
        WHERE r.accounting_date BETWEEN ${range.from} AND ${range.to}
          AND EXISTS (
            SELECT 1 FROM return_postings rp
            WHERE rp.return_id = r.id AND rp.role = 'return_against_uncollected'
          )
      ), grouped AS (
        SELECT group_key, name_ar, name_en,
          SUM(gross_sales) AS gross_sales,
          SUM(tier_discounts) AS tier_discounts,
          SUM(coupon_discounts) AS coupon_discounts,
          SUM(other_discounts) AS other_discounts,
          SUM(returns) AS returns,
          SUM(net_sales) AS net_sales,
          COUNT(DISTINCT order_id) FILTER (WHERE sale_order) AS order_count
        FROM activity
        GROUP BY group_key, name_ar, name_en
      )
      SELECT *, COUNT(*) OVER() AS total_groups
      FROM grouped
      ORDER BY ${order}, group_key ASC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `);
    const totalsRows = await this.prisma.$queryRaw<
      Array<
        Omit<GroupRow, 'group_key' | 'name_ar' | 'name_en' | 'total_groups'>
      >
    >(Prisma.sql`
      WITH sold AS (
        SELECT o.id, o.original_delivery_fee, o.delivery_fee,
          SUM(oi.line_total) AS gross_sales,
          SUM(oi.tier_discount_share) AS tier_discounts,
          SUM(oi.coupon_discount_share) AS coupon_discounts,
          SUM(GREATEST(oi.line_total - oi.net_paid_total - oi.tier_discount_share - oi.coupon_discount_share, 0)) AS other_discounts,
          SUM(oi.net_paid_total) AS sold_net
        FROM delivery_collections dc
        JOIN journal_entries posted ON posted.id = dc.delivery_journal_entry_id
        JOIN orders o ON o.id = dc.order_id
        JOIN order_items oi ON oi.order_id = o.id
        WHERE dc.accounting_date BETWEEN ${range.from} AND ${range.to}
        GROUP BY o.id, o.original_delivery_fee, o.delivery_fee
      ), sold_totals AS (
        SELECT
          COALESCE(SUM(gross_sales), 0) AS gross_sales,
          COALESCE(SUM(tier_discounts), 0) AS tier_discounts,
          COALESCE(SUM(coupon_discounts), 0) AS coupon_discounts,
          COALESCE(SUM(other_discounts), 0) AS other_discounts,
          COALESCE(SUM(sold_net), 0) AS sold_net,
          COUNT(id) AS order_count,
          COALESCE(SUM(original_delivery_fee), 0) AS original_delivery_fees,
          COALESCE(SUM(delivery_fee), 0) AS charged_delivery_fees,
          COALESCE(SUM(delivery_fee - original_delivery_fee), 0) AS delivery_fee_adjustments
        FROM sold
      ), returned_goods AS (
        SELECT COALESCE(SUM(ri.approved_refund), 0) AS returns
        FROM returns r
        JOIN return_items ri ON ri.return_id = r.id AND ri.approved_quantity > 0
        WHERE r.accounting_date BETWEEN ${range.from} AND ${range.to}
          AND EXISTS (
            SELECT 1 FROM return_postings rp
            WHERE rp.return_id = r.id AND rp.role = 'return_against_uncollected'
          )
      ), returned_fees AS (
        SELECT COALESCE(SUM(r.delivery_fee_refund), 0) AS delivery_fee_refunds
        FROM returns r
        WHERE r.accounting_date BETWEEN ${range.from} AND ${range.to}
          AND EXISTS (
            SELECT 1 FROM return_postings rp
            WHERE rp.return_id = r.id AND rp.role = 'delivery_fee_refund'
          )
      ), returned AS (
        SELECT returned_goods.returns, returned_fees.delivery_fee_refunds
        FROM returned_goods CROSS JOIN returned_fees
      )
      SELECT
        sold_totals.gross_sales,
        sold_totals.tier_discounts,
        sold_totals.coupon_discounts,
        sold_totals.other_discounts,
        returned.returns,
        sold_totals.sold_net - returned.returns AS net_sales,
        sold_totals.order_count,
        0::bigint AS total_groups,
        sold_totals.original_delivery_fees,
        sold_totals.charged_delivery_fees,
        sold_totals.delivery_fee_adjustments,
        returned.delivery_fee_refunds
      FROM sold_totals CROSS JOIN returned
    `);
    const total = totalsRows[0] as (typeof totalsRows)[number] & {
      original_delivery_fees: Value;
      charged_delivery_fees: Value;
      delivery_fee_adjustments: Value;
      delivery_fee_refunds: Value;
    };
    const statusCounts = await this.prisma.$queryRaw<
      Array<{ cancelled_count: bigint; rejected_count: bigint }>
    >(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
        COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count
      FROM orders
      WHERE document_date BETWEEN ${range.from} AND ${range.to}
    `);
    const orderCount = count(total.order_count);
    const netWithDelivery = decimal(total.net_sales)
      .plus(decimal(total.charged_delivery_fees))
      .minus(decimal(total.delivery_fee_refunds));
    const result = {
      from: fromText,
      to: toText,
      // Kept as additive compatibility aliases for the pre-17.3 sales shape.
      orders_count: orderCount,
      gross_sales: Number(decimal(total.gross_sales).toString()),
      discounts: Number(
        decimal(total.tier_discounts)
          .plus(decimal(total.coupon_discounts))
          .plus(decimal(total.other_discounts))
          .toString(),
      ),
      net_sales: Number(decimal(total.net_sales).toString()),
      by_day:
        group === 'day'
          ? rows.map((row) => ({
              date: row.group_key,
              orders_count: count(row.order_count),
              net_sales: Number(decimal(row.net_sales).toString()),
            }))
          : [],
      top_products: [],
      group_by: group,
      currency: 'IQD',
      touches_open_period: await this.touchesOpenPeriod(range.from, range.to),
      totals: {
        gross_sales: money(total.gross_sales),
        tier_discounts: money(total.tier_discounts),
        coupon_discounts: money(total.coupon_discounts),
        other_discounts: money(total.other_discounts),
        returns: money(total.returns),
        net_sales: money(total.net_sales),
        original_delivery_fees: money(total.original_delivery_fees),
        charged_delivery_fees: money(total.charged_delivery_fees),
        delivery_fee_adjustments: money(total.delivery_fee_adjustments),
        delivery_fee_refunds: money(total.delivery_fee_refunds),
        order_count: orderCount,
        average_order_value:
          orderCount === 0
            ? money(0)
            : netWithDelivery.div(orderCount).toFixed(4),
        cancelled_count: count(statusCounts[0].cancelled_count),
        rejected_count: count(statusCounts[0].rejected_count),
      },
      pagination: {
        page,
        per_page: perPage,
        total: rows.length ? count(rows[0].total_groups) : 0,
        pages: rows.length
          ? Math.ceil(count(rows[0].total_groups) / perPage)
          : 0,
      },
      data: rows.map((row) => this.salesRow(row)),
    };
    if (audit)
      await this.auditRead(actor.id, 'sales', {
        from: fromText,
        to: toText,
        group_by: group,
      });
    return result;
  }

  async profitability(
    actor: Actor,
    query: ProfitabilityReportQueryDto,
    audit = true,
  ) {
    this.require(actor, 'reports.profit.read');
    const range = this.range(query.from, query.to);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 50;
    const group = query.group_by ?? 'product';
    const dimension = this.dimension(group);
    const order = this.order(query.sort, query.direction);
    const rows = await this.prisma.$queryRaw<ProfitRow[]>(Prisma.sql`
      WITH item_cost AS (
        SELECT order_item_id, SUM(quantity * unit_cost_iqd) AS issue_cost
        FROM custody_holdings
        GROUP BY order_item_id
      ), activity AS (
        SELECT ${dimension.key} AS group_key,
          ${dimension.ar} AS name_ar, ${dimension.en} AS name_en,
          oi.line_total AS gross_sales,
          oi.tier_discount_share AS tier_discounts,
          oi.coupon_discount_share AS coupon_discounts,
          GREATEST(oi.line_total - oi.net_paid_total - oi.tier_discount_share - oi.coupon_discount_share, 0) AS other_discounts,
          0::numeric AS returns, oi.net_paid_total AS net_sales,
          COALESCE(item_cost.issue_cost, 0) AS cost_of_goods_sold,
          0::numeric AS return_cost_reversals,
          0::numeric AS inventory_write_downs,
          o.id AS order_id, TRUE AS sale_order
        FROM delivery_collections dc
        JOIN journal_entries posted ON posted.id = dc.delivery_journal_entry_id
        JOIN orders o ON o.id = dc.order_id
        JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN item_cost ON item_cost.order_item_id = oi.id
        JOIN products product ON product.id = oi.product_id
        JOIN product_variants variant ON variant.id = oi.variant_id
        JOIN categories category ON category.id = product.category_id
        LEFT JOIN categories parent ON parent.id = category.parent_id
        LEFT JOIN brands brand ON brand.id = product.brand_id
        WHERE dc.accounting_date BETWEEN ${range.from} AND ${range.to}

        UNION ALL

        SELECT ${dimension.returnKey}, ${dimension.returnAr}, ${dimension.returnEn},
          0::numeric, 0::numeric, 0::numeric, 0::numeric,
          ri.approved_refund, -ri.approved_refund,
          0::numeric, ri.issue_cost_value, 0::numeric,
          r.order_id, FALSE
        FROM returns r
        JOIN return_items ri ON ri.return_id = r.id AND ri.approved_quantity > 0
        JOIN order_items oi ON oi.id = ri.order_item_id
        JOIN products product ON product.id = oi.product_id
        JOIN product_variants variant ON variant.id = oi.variant_id
        JOIN categories category ON category.id = product.category_id
        LEFT JOIN categories parent ON parent.id = category.parent_id
        LEFT JOIN brands brand ON brand.id = product.brand_id
        WHERE r.accounting_date BETWEEN ${range.from} AND ${range.to}
          AND EXISTS (SELECT 1 FROM return_postings rp WHERE rp.return_id = r.id AND rp.role = 'return_against_uncollected')

        UNION ALL

        SELECT ${dimension.writeDownKey}, ${dimension.writeDownAr}, ${dimension.writeDownEn},
          0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric,
          0::numeric, 0::numeric, wdl.quantity * wdl.unit_cost_iqd,
          NULL::uuid, FALSE
        FROM inventory_write_downs wd
        JOIN inventory_write_down_lines wdl ON wdl.write_down_id = wd.id
        JOIN product_variants variant ON variant.id = wdl.variant_id
        JOIN products product ON product.id = variant.product_id
        JOIN categories category ON category.id = product.category_id
        LEFT JOIN categories parent ON parent.id = category.parent_id
        LEFT JOIN brands brand ON brand.id = product.brand_id
        WHERE wd.accounting_date BETWEEN ${range.from} AND ${range.to}
      ), grouped AS (
        SELECT group_key, name_ar, name_en,
          SUM(gross_sales) AS gross_sales,
          SUM(tier_discounts) AS tier_discounts,
          SUM(coupon_discounts) AS coupon_discounts,
          SUM(other_discounts) AS other_discounts,
          SUM(returns) AS returns,
          SUM(net_sales) AS net_sales,
          SUM(cost_of_goods_sold) AS cost_of_goods_sold,
          SUM(return_cost_reversals) AS return_cost_reversals,
          SUM(inventory_write_downs) AS inventory_write_downs,
          COUNT(DISTINCT order_id) FILTER (WHERE sale_order) AS order_count
        FROM activity GROUP BY group_key, name_ar, name_en
      )
      SELECT *, COUNT(*) OVER() AS total_groups
      FROM grouped
      ORDER BY ${order}, group_key ASC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `);
    const totalsRows = await this.prisma.$queryRaw<ProfitRow[]>(Prisma.sql`
      WITH item_cost AS (
        SELECT order_item_id, SUM(quantity * unit_cost_iqd) AS issue_cost
        FROM custody_holdings GROUP BY order_item_id
      ), sold AS (
        SELECT oi.*, o.id AS sold_order_id, COALESCE(item_cost.issue_cost, 0) AS issue_cost
        FROM delivery_collections dc
        JOIN journal_entries posted ON posted.id = dc.delivery_journal_entry_id
        JOIN orders o ON o.id = dc.order_id
        JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN item_cost ON item_cost.order_item_id = oi.id
        WHERE dc.accounting_date BETWEEN ${range.from} AND ${range.to}
      ), returned AS (
        SELECT COALESCE(SUM(ri.approved_refund), 0) AS amount,
          COALESCE(SUM(ri.issue_cost_value), 0) AS cost
        FROM returns r JOIN return_items ri ON ri.return_id = r.id AND ri.approved_quantity > 0
        WHERE r.accounting_date BETWEEN ${range.from} AND ${range.to}
          AND EXISTS (SELECT 1 FROM return_postings rp WHERE rp.return_id = r.id AND rp.role = 'return_against_uncollected')
      ), written AS (
        SELECT COALESCE(SUM(wdl.quantity * wdl.unit_cost_iqd), 0) AS amount
        FROM inventory_write_downs wd
        JOIN inventory_write_down_lines wdl ON wdl.write_down_id = wd.id
        WHERE wd.accounting_date BETWEEN ${range.from} AND ${range.to}
      ), sold_totals AS (
        SELECT
          COALESCE(SUM(line_total), 0) AS gross_sales,
          COALESCE(SUM(tier_discount_share), 0) AS tier_discounts,
          COALESCE(SUM(coupon_discount_share), 0) AS coupon_discounts,
          COALESCE(SUM(GREATEST(line_total - net_paid_total - tier_discount_share - coupon_discount_share, 0)), 0) AS other_discounts,
          COALESCE(SUM(net_paid_total), 0) AS sold_net,
          COALESCE(SUM(issue_cost), 0) AS issue_cost,
          COUNT(DISTINCT sold_order_id) AS order_count
        FROM sold
      )
      SELECT 'all' AS group_key, 'الكل' AS name_ar, 'All' AS name_en,
        sold_totals.gross_sales,
        sold_totals.tier_discounts,
        sold_totals.coupon_discounts,
        sold_totals.other_discounts,
        returned.amount AS returns,
        sold_totals.sold_net - returned.amount AS net_sales,
        sold_totals.issue_cost AS cost_of_goods_sold,
        returned.cost AS return_cost_reversals,
        written.amount AS inventory_write_downs,
        sold_totals.order_count,
        1::bigint AS total_groups
      FROM sold_totals CROSS JOIN returned CROSS JOIN written
    `);
    const total = totalsRows[0];
    const result = {
      from: query.from,
      to: query.to,
      group_by: group,
      currency: 'IQD',
      touches_open_period: await this.touchesOpenPeriod(range.from, range.to),
      totals: this.profitRow(total),
      pagination: {
        page,
        per_page: perPage,
        total: rows.length ? count(rows[0].total_groups) : 0,
        pages: rows.length
          ? Math.ceil(count(rows[0].total_groups) / perPage)
          : 0,
      },
      data: rows.map((row) => this.profitRow(row)),
    };
    if (audit)
      await this.auditRead(actor.id, 'profitability', {
        from: query.from,
        to: query.to,
        group_by: group,
      });
    return result;
  }

  async profitLoss(actor: Actor, query: ProfitLossQueryDto, audit = true) {
    this.require(actor, 'reports.financial.read');
    const range = this.range(query.from, query.to);
    const days =
      Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000) + 1;
    const previousTo = addBusinessDateDays(range.from, -1);
    const previousFrom = addBusinessDateDays(previousTo, -(days - 1));
    const [current, previous, categories, previousCategories] =
      await Promise.all([
        this.profitLossPeriod(range.from, range.to),
        this.profitLossPeriod(previousFrom, previousTo),
        this.expensesByCategory(range.from, range.to),
        this.expensesByCategory(previousFrom, previousTo),
      ]);
    const result = {
      from: query.from,
      to: query.to,
      previous_from: businessDateText(previousFrom),
      previous_to: businessDateText(previousTo),
      currency: 'IQD',
      touches_open_period: await this.touchesOpenPeriod(range.from, range.to),
      current: { ...this.presentProfitLoss(current), expenses: categories },
      previous: {
        ...this.presentProfitLoss(previous),
        expenses: previousCategories,
      },
    };
    if (audit)
      await this.auditRead(actor.id, 'profit_loss', {
        from: query.from,
        to: query.to,
      });
    return result;
  }

  async trialBalance(actor: Actor, query: AsOfReportQueryDto) {
    this.require(actor, 'reports.financial.read');
    const asOf = parseBusinessDate(query.as_of);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 100;
    const direction =
      query.direction === 'desc' ? Prisma.raw('DESC') : Prisma.raw('ASC');
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        code: string;
        name_ar: string;
        name_en: string;
        type: string;
        normal_side: string;
        debit: Value;
        credit: Value;
        balance: Value;
      }>
    >(Prisma.sql`
      WITH balances AS (
        SELECT a.id, a.code, a.name_ar, a.name_en, a.type, a.normal_side,
          COALESCE(totals.debit, 0) AS debit,
          COALESCE(totals.credit, 0) AS credit
        FROM ledger_accounts a
        LEFT JOIN LATERAL (
          SELECT SUM(jl.debit_base) AS debit, SUM(jl.credit_base) AS credit
          FROM journal_lines jl
          JOIN journal_entries je ON je.id = jl.entry_id
          WHERE jl.account_id = a.id AND je.accounting_date <= ${asOf}
        ) totals ON TRUE
      )
      SELECT *,
        CASE WHEN normal_side = 'credit' THEN credit - debit ELSE debit - credit END AS balance
      FROM balances
      ORDER BY code ${direction}, id ${direction}
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `);
    const summary = await this.trialBalanceTotals(asOf);
    const totalAccounts = count(summary.total_accounts);
    return {
      as_of: query.as_of,
      currency: 'IQD',
      touches_open_period: await this.touchesOpenPeriod(asOf, asOf),
      debit_total: money(summary.debit),
      credit_total: money(summary.credit),
      balanced: decimal(summary.debit).equals(decimal(summary.credit)),
      pagination: {
        page,
        per_page: perPage,
        total: totalAccounts,
        pages: Math.ceil(totalAccounts / perPage),
      },
      data: rows.map((row) => ({
        id: row.id,
        code: row.code,
        name_ar: row.name_ar,
        name_en: row.name_en,
        type: row.type,
        normal_side: row.normal_side,
        debit: money(row.debit),
        credit: money(row.credit),
        balance: money(row.balance),
      })),
    };
  }

  async balanceSheet(actor: Actor, query: AsOfReportQueryDto) {
    this.require(actor, 'reports.financial.read');
    const asOf = parseBusinessDate(query.as_of);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 100;
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        code: string;
        name_ar: string;
        name_en: string;
        type: string;
        balance: Value;
      }>
    >(Prisma.sql`
      WITH account_balances AS (
        SELECT a.id, a.code, a.name_ar, a.name_en, a.type, a.normal_side,
          COALESCE(totals.debit, 0) AS debit,
          COALESCE(totals.credit, 0) AS credit
        FROM ledger_accounts a
        LEFT JOIN LATERAL (
          SELECT SUM(jl.debit_base) AS debit, SUM(jl.credit_base) AS credit
          FROM journal_lines jl
          JOIN journal_entries je ON je.id = jl.entry_id
          WHERE jl.account_id = a.id AND je.accounting_date <= ${asOf}
        ) totals ON TRUE
      ), statement_accounts AS (
        SELECT *, CASE WHEN type = 'asset' THEN debit - credit ELSE credit - debit END AS balance
        FROM account_balances WHERE type IN ('asset','liability','equity')
      )
      SELECT statement_accounts.*
      FROM statement_accounts
      ORDER BY code ASC, id ASC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `);
    // Page windows contain the full partition total, but a page might not touch
    // every account type. Fetch the three totals directly for a stable summary.
    const summaries = await this.balanceSheetTotals(asOf);
    const assets = decimal(summaries.assets);
    const liabilities = decimal(summaries.liabilities);
    const equity = decimal(summaries.equity);
    const earnings = decimal(summaries.current_earnings);
    const totalAccounts = count(summaries.total_accounts);
    return {
      as_of: query.as_of,
      currency: 'IQD',
      touches_open_period: await this.touchesOpenPeriod(asOf, asOf),
      totals: {
        assets: assets.toFixed(4),
        liabilities: liabilities.toFixed(4),
        equity: equity.toFixed(4),
        current_earnings: earnings.toFixed(4),
        liabilities_and_equity: liabilities
          .plus(equity)
          .plus(earnings)
          .toFixed(4),
        balanced: assets.equals(liabilities.plus(equity).plus(earnings)),
      },
      pagination: {
        page,
        per_page: perPage,
        total: totalAccounts,
        pages: Math.ceil(totalAccounts / perPage),
      },
      data: rows.map((row) => ({
        id: row.id,
        code: row.code,
        name_ar: row.name_ar,
        name_en: row.name_en,
        type: row.type,
        balance: money(row.balance),
      })),
    };
  }

  private range(fromText: string, toText: string) {
    const from = parseBusinessDate(fromText);
    const to = parseBusinessDate(toText);
    if (from > to) throw reportError('from must be on or before to');
    return { from, to };
  }

  private require(actor: Actor, permission: string) {
    if (!actor.permissions.includes(permission)) {
      throw new ForbiddenException({
        status: 403,
        code: 'PERMISSION_DENIED',
        message: `Missing permission: ${permission}`,
        errors: [],
      });
    }
  }

  private dimension(group: SalesGroup | ProfitGroup) {
    const date = (prefix: string) => Prisma.raw(`${prefix}.accounting_date`);
    const fields = (dateField: Prisma.Sql) => {
      if (group === 'day')
        return {
          key: Prisma.sql`to_char(${dateField}, 'YYYY-MM-DD')`,
          ar: Prisma.sql`to_char(${dateField}, 'YYYY-MM-DD')`,
          en: Prisma.sql`to_char(${dateField}, 'YYYY-MM-DD')`,
        };
      if (group === 'week')
        return {
          key: Prisma.sql`to_char((${dateField} - extract(dow from ${dateField})::int)::date, 'YYYY-MM-DD')`,
          ar: Prisma.sql`to_char((${dateField} - extract(dow from ${dateField})::int)::date, 'YYYY-MM-DD')`,
          en: Prisma.sql`to_char((${dateField} - extract(dow from ${dateField})::int)::date, 'YYYY-MM-DD')`,
        };
      if (group === 'month')
        return {
          key: Prisma.sql`to_char(${dateField}, 'YYYY-MM')`,
          ar: Prisma.sql`to_char(${dateField}, 'YYYY-MM')`,
          en: Prisma.sql`to_char(${dateField}, 'YYYY-MM')`,
        };
      if (group === 'department')
        return {
          key: Prisma.sql`COALESCE(parent.id, category.id)::text`,
          ar: Prisma.sql`COALESCE(parent.name_ar, category.name_ar)`,
          en: Prisma.sql`COALESCE(parent.name_en, category.name_en)`,
        };
      if (group === 'category')
        return {
          key: Prisma.sql`category.id::text`,
          ar: Prisma.sql`category.name_ar`,
          en: Prisma.sql`category.name_en`,
        };
      if (group === 'brand')
        return {
          key: Prisma.sql`COALESCE(brand.id::text, 'unbranded')`,
          ar: Prisma.sql`COALESCE(brand.name_ar, 'بدون علامة تجارية')`,
          en: Prisma.sql`COALESCE(brand.name_en, 'Unbranded')`,
        };
      if (group === 'sku')
        return {
          key: Prisma.sql`variant.id::text`,
          ar: Prisma.sql`variant.sku`,
          en: Prisma.sql`variant.sku`,
        };
      return {
        key: Prisma.sql`product.id::text`,
        ar: Prisma.sql`product.name_ar`,
        en: Prisma.sql`product.name_en`,
      };
    };
    const sold = fields(date('dc'));
    const returned = fields(date('r'));
    // Write-down dimensions never permit date/brand under ProfitGroup, but use
    // the document date so the helper stays safe if extended later.
    const written = fields(date('wd'));
    return {
      key: sold.key,
      ar: sold.ar,
      en: sold.en,
      returnKey: returned.key,
      returnAr: returned.ar,
      returnEn: returned.en,
      writeDownKey: written.key,
      writeDownAr: written.ar,
      writeDownEn: written.en,
    };
  }

  private order(sort?: string, direction?: 'asc' | 'desc') {
    const field =
      sort === 'gross_sales'
        ? 'gross_sales'
        : sort === 'net_sales'
          ? 'net_sales'
          : sort === 'order_count'
            ? 'order_count'
            : 'group_key';
    return Prisma.raw(`${field} ${direction === 'desc' ? 'DESC' : 'ASC'}`);
  }

  private salesRow(row: GroupRow) {
    const orderCount = count(row.order_count);
    return {
      key: row.group_key,
      name_ar: row.name_ar,
      name_en: row.name_en,
      gross_sales: money(row.gross_sales),
      tier_discounts: money(row.tier_discounts),
      coupon_discounts: money(row.coupon_discounts),
      other_discounts: money(row.other_discounts),
      returns: money(row.returns),
      net_sales: money(row.net_sales),
      order_count: orderCount,
      average_order_value:
        orderCount === 0
          ? money(0)
          : decimal(row.net_sales).div(orderCount).toFixed(4),
    };
  }

  private profitRow(row: ProfitRow) {
    const base = this.salesRow(row);
    const grossProfit = decimal(row.net_sales)
      .minus(decimal(row.cost_of_goods_sold))
      .plus(decimal(row.return_cost_reversals));
    return {
      ...base,
      cost_of_goods_sold: money(row.cost_of_goods_sold),
      return_cost_reversals: money(row.return_cost_reversals),
      gross_profit: grossProfit.toFixed(4),
      margin_percent: decimal(row.net_sales).isZero()
        ? null
        : grossProfit.div(decimal(row.net_sales)).times(100).toFixed(4),
      inventory_write_downs: money(row.inventory_write_downs),
    };
  }

  private async touchesOpenPeriod(from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<Array<{ touches: boolean }>>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1
          FROM generate_series(
            date_trunc('month', ${from}::date),
            date_trunc('month', ${to}::date),
            interval '1 month'
          ) AS months(value)
          LEFT JOIN accounting_periods period ON period.month = months.value::date
          WHERE COALESCE(period.status, 'open') <> 'closed'
        ) AS touches
      `,
    );
    return rows[0]?.touches ?? true;
  }

  private async profitLossPeriod(from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        sales_revenue: Value;
        delivery_revenue: Value;
        sales_returns: Value;
        delivery_fee_refunds: Value;
        cost_of_goods_sold: Value;
        inventory_write_downs: Value;
        operating_expenses: Value;
        other_income: Value;
        other_costs: Value;
      }>
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(jl.credit_base - jl.debit_base) FILTER (WHERE a.code = '4000'), 0) AS sales_revenue,
        COALESCE(SUM(jl.credit_base - jl.debit_base) FILTER (WHERE a.code = '4010'), 0) AS delivery_revenue,
        COALESCE(SUM(jl.debit_base - jl.credit_base) FILTER (WHERE a.code = '4100'), 0) AS sales_returns,
        COALESCE(SUM(jl.debit_base - jl.credit_base) FILTER (WHERE a.code = '4110'), 0) AS delivery_fee_refunds,
        COALESCE(SUM(jl.debit_base - jl.credit_base) FILTER (WHERE a.code = '5000'), 0) AS cost_of_goods_sold,
        COALESCE(SUM(jl.debit_base - jl.credit_base) FILTER (WHERE a.code = '5010'), 0) AS inventory_write_downs,
        COALESCE(SUM(jl.debit_base - jl.credit_base) FILTER (
          WHERE a.type = 'expense'
            AND (expense_source.id IS NOT NULL OR expense_correction_source.id IS NOT NULL)
        ), 0) AS operating_expenses,
        COALESCE(SUM(jl.credit_base - jl.debit_base) FILTER (WHERE a.type = 'income' AND a.code NOT IN ('4000','4010')), 0) AS other_income,
        COALESCE(SUM(jl.debit_base - jl.credit_base) FILTER (
          WHERE a.type = 'expense'
            AND a.code NOT IN ('5000','5010')
            AND expense_source.id IS NULL
            AND expense_correction_source.id IS NULL
        ), 0) AS other_costs
      FROM journal_entries je
      JOIN journal_lines jl ON jl.entry_id = je.id
      JOIN ledger_accounts a ON a.id = jl.account_id
      LEFT JOIN expenses expense_source ON expense_source.journal_entry_id = je.id
      LEFT JOIN expense_correction_postings expense_correction_source
        ON expense_correction_source.reversal_journal_entry_id = je.id
       AND expense_correction_source.role = 'expense'
      WHERE je.accounting_date BETWEEN ${from} AND ${to}
    `);
    return rows[0];
  }

  private async expensesByCategory(from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        code: string;
        name_ar: string;
        name_en: string;
        amount: Value;
      }>
    >(Prisma.sql`
      SELECT ec.id, ec.code, ec.name_ar, ec.name_en,
        COALESCE(SUM(activity.amount), 0) AS amount
      FROM expense_categories ec
      LEFT JOIN LATERAL (
        SELECT jl.debit_base - jl.credit_base AS amount
        FROM expenses e
        JOIN journal_entries je ON je.id = e.journal_entry_id
        JOIN journal_lines jl
          ON jl.entry_id = je.id
         AND jl.account_id = ec.ledger_account_id
        WHERE e.category_id = ec.id
          AND je.accounting_date BETWEEN ${from} AND ${to}

        UNION ALL

        SELECT jl.debit_base - jl.credit_base AS amount
        FROM expenses e
        JOIN expense_correction_postings posting
          ON posting.original_journal_entry_id = e.journal_entry_id
         AND posting.role = 'expense'
        JOIN journal_entries je ON je.id = posting.reversal_journal_entry_id
        JOIN journal_lines jl
          ON jl.entry_id = je.id
         AND jl.account_id = ec.ledger_account_id
        WHERE e.category_id = ec.id
          AND je.accounting_date BETWEEN ${from} AND ${to}
      ) activity ON TRUE
      GROUP BY ec.id, ec.code, ec.name_ar, ec.name_en
      HAVING COALESCE(SUM(activity.amount), 0) <> 0
      ORDER BY ec.name_en ASC, ec.id ASC
    `);
    return rows.map((row) => ({ ...row, amount: money(row.amount) }));
  }

  private presentProfitLoss(
    row: Awaited<ReturnType<ReportsService['profitLossPeriod']>>,
  ) {
    const revenue = decimal(row.sales_revenue)
      .plus(decimal(row.delivery_revenue))
      .minus(decimal(row.sales_returns))
      .minus(decimal(row.delivery_fee_refunds));
    const grossProfit = revenue.minus(decimal(row.cost_of_goods_sold));
    const netProfit = grossProfit
      .minus(decimal(row.operating_expenses))
      .minus(decimal(row.inventory_write_downs))
      .plus(decimal(row.other_income))
      .minus(decimal(row.other_costs));
    return {
      sales_revenue: money(row.sales_revenue),
      delivery_revenue: money(row.delivery_revenue),
      sales_returns: money(row.sales_returns),
      delivery_fee_refunds: money(row.delivery_fee_refunds),
      net_revenue: revenue.toFixed(4),
      cost_of_goods_sold: money(row.cost_of_goods_sold),
      gross_profit: grossProfit.toFixed(4),
      operating_expenses: money(row.operating_expenses),
      inventory_write_downs: money(row.inventory_write_downs),
      other_income: money(row.other_income),
      other_costs: money(row.other_costs),
      net_profit: netProfit.toFixed(4),
    };
  }

  private async balanceSheetTotals(asOf: Date) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        assets: Value;
        liabilities: Value;
        equity: Value;
        current_earnings: Value;
        total_accounts: bigint;
      }>
    >(Prisma.sql`
      WITH balances AS (
        SELECT a.type, a.normal_side,
          COALESCE(totals.debit, 0) AS debit,
          COALESCE(totals.credit, 0) AS credit
        FROM ledger_accounts a
        LEFT JOIN LATERAL (
          SELECT SUM(jl.debit_base) AS debit, SUM(jl.credit_base) AS credit
          FROM journal_lines jl
          JOIN journal_entries je ON je.id = jl.entry_id
          WHERE jl.account_id = a.id AND je.accounting_date <= ${asOf}
        ) totals ON TRUE
      )
      SELECT
        COALESCE(SUM(debit - credit) FILTER (WHERE type = 'asset'), 0) AS assets,
        COALESCE(SUM(credit - debit) FILTER (WHERE type = 'liability'), 0) AS liabilities,
        COALESCE(SUM(credit - debit) FILTER (WHERE type = 'equity'), 0) AS equity,
        COALESCE(SUM(CASE WHEN type IN ('income','contra_expense','expense','contra_revenue') THEN credit - debit ELSE 0 END), 0) AS current_earnings,
        COUNT(*) FILTER (WHERE type IN ('asset','liability','equity')) AS total_accounts
      FROM balances
    `);
    return rows[0];
  }

  private async trialBalanceTotals(asOf: Date) {
    const rows = await this.prisma.$queryRaw<
      Array<{ debit: Value; credit: Value; total_accounts: bigint }>
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(jl.debit_base), 0) AS debit,
        COALESCE(SUM(jl.credit_base), 0) AS credit,
        (SELECT COUNT(*) FROM ledger_accounts) AS total_accounts
      FROM journal_entries je
      JOIN journal_lines jl ON jl.entry_id = je.id
      WHERE je.accounting_date <= ${asOf}
    `);
    return rows[0];
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
