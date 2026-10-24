import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AlertTriangle, CircleCheck } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { PeriodSelector } from "@/components/home/period-selector";
import { SetupStrip } from "@/components/home/setup-strip";
import { NAV_ICONS } from "@/components/shell/nav-icons";
import { load, serverApi } from "@/lib/api/server";
import { cn } from "@/lib/cn";
import { ADMIN_MODULES } from "@/lib/config";
import { firstDayComplete, firstDaySteps } from "@/lib/first-day";
import { resolveHomePeriod, type HomePeriod } from "@/lib/home-period";
import { locationIndex } from "@/lib/inventory";
import { parseModules } from "@/lib/modules";
import { visibleNav, type NavKey } from "@/lib/nav";
import { formatReportAmount } from "@/lib/reports";
import type { components } from "@/types/api";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("dashboard") };
}

type Api = Awaited<ReturnType<typeof serverApi>>;
type OwnerDashboard = components["schemas"]["OwnerDashboard"];

/** The few pages offered as shortcuts, in this order, when the person may open them. */
const SHORTCUTS: readonly NavKey[] = ["orders", "products", "stock", "purchasing", "cashReceipts", "reports"];

/**
 * Home (VIS-003), in this order: a compact store-setup strip, what needs
 * attention now, performance for one chosen period, and a handful of
 * shortcuts. Every page stays in the sidebar; home no longer lists them all.
 * Each part shows only what the staff member's permissions and this
 * installation's modules (ADMIN_MODULES) open.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const t = await getTranslations("dashboard");
  const tNav = await getTranslations("nav");
  const query = await searchParams;
  const api = await serverApi();
  const me = await load(api.GET("/me"));
  const user = me.ok ? me.data : null;
  const modules = parseModules(ADMIN_MODULES);
  const permissions = user?.permissions ?? [];
  const visible = visibleNav(permissions, undefined, modules);
  const shortcuts = SHORTCUTS.flatMap((key) => visible.find((item) => item.key === key) ?? []).slice(0, 6);
  const [facts, summary] = await Promise.all([
    firstDayFacts(api, permissions),
    dashboardSummary(api, permissions),
  ]);
  const steps = firstDaySteps({ permissions, modules, ...facts });
  const period = summary ? resolveHomePeriod(query, summary.business_date) : null;

  return (
    <div data-testid="dashboard">
      <PageHeader title={t("welcome", { name: user?.name || user?.username || "" })} />
      {steps.length ? <SetupStrip steps={steps} complete={firstDayComplete(steps)} /> : null}
      {summary ? <NeedsAttention summary={summary} /> : null}
      {summary && period && permissions.includes("reports.sales.read") ? (
        <Performance api={api} period={period} today={summary.business_date} canSeeProfit={permissions.includes("reports.profit.read")} />
      ) : null}
      {shortcuts.length ? (
        <section aria-labelledby="shortcuts-title" data-testid="shortcuts">
          <h2 id="shortcuts-title" className="mb-3 text-section text-text">{t("shortcuts.title")}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {shortcuts.map((item) => {
              const Icon = NAV_ICONS[item.key];
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    data-testid={`shortcut-${item.key}`}
                    className="flex h-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3 text-label text-text shadow-sm transition-colors hover:border-primary hover:bg-card focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/40"
                  >
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary-dark">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0">{tNav(item.key)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {visible.length <= 1 ? (
        <p className="mt-6 text-body text-text-muted" data-testid="no-sections">
          {t("noSections")}
        </p>
      ) : null}
    </div>
  );
}

async function dashboardSummary(api: Api, permissions: readonly string[]): Promise<OwnerDashboard | null> {
  const readable = ["orders.view", "reports.sales.read", "reports.profit.read", "reports.cash.read", "reports.liabilities.read", "reports.inventory.read", "reports.purchases.read", "reports.suppliers.read", "reports.stock.read", "reports.expenses.read"];
  if (!readable.some((permission) => permissions.includes(permission))) return null;
  const result = await load(api.GET("/admin/reports/dashboard"));
  return result.ok ? result.data : null;
}

/**
 * What needs someone now. Each card opens the matching filtered list; a
 * card is shown only when the API sent its figure (permission-dependent),
 * and it only looks like an alert when there is something to do.
 */
async function NeedsAttention({ summary }: { summary: OwnerDashboard }) {
  const t = await getTranslations("dashboard.attention");
  const locale = await getLocale();
  const cards: { id: string; href: string; label: string; value: string; active: boolean }[] = [];
  if (summary.orders_waiting_confirmation_call !== undefined) {
    cards.push({ id: "waiting-calls", href: "/orders?status=pending", label: t("waitingCalls"), value: String(summary.orders_waiting_confirmation_call), active: summary.orders_waiting_confirmation_call > 0 });
  }
  if (summary.late_orders !== undefined) {
    cards.push({ id: "late-orders", href: "/orders?queue=late", label: t("lateOrders"), value: String(summary.late_orders), active: summary.late_orders > 0 });
  }
  if (summary.low_stock_count !== undefined) {
    cards.push({ id: "low-stock", href: "/catalog/products?stock_state=low", label: t("lowStock"), value: String(summary.low_stock_count), active: summary.low_stock_count > 0 });
  }
  if (summary.payables_due_next_7_days !== undefined) {
    cards.push({ id: "payables-due", href: `/purchasing/reports?as_of=${summary.business_date}`, label: t("payablesDue"), value: formatReportAmount(summary.payables_due_next_7_days, locale), active: Number(summary.payables_due_next_7_days) > 0 });
  }
  if (!cards.length) return null;
  return (
    <section className="mb-8" aria-labelledby="attention-title" data-testid="owner-dashboard-summary">
      <h2 id="attention-title" className="mb-3 text-section text-text">{t("title")}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.id}
            href={card.href}
            data-testid={card.id}
            data-attention={card.active}
            className={cn(
              "group flex flex-col gap-1 rounded-lg border px-4 py-3 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/40",
              card.active ? "border-warning bg-warning/10 hover:bg-warning/15" : "border-border bg-surface hover:bg-card",
            )}
          >
            <span className="flex items-center gap-2 text-caption text-text-muted">
              {card.active ? (
                <AlertTriangle className="size-4 text-warning-dark" aria-hidden />
              ) : (
                <CircleCheck className="size-4 text-success-dark" aria-hidden />
              )}
              {card.label}
            </span>
            <span className="text-page-title tabular-nums text-text" data-testid={`${card.id}-value`}>
              {card.value}
            </span>
            {card.active ? null : <span className="text-caption text-text-muted">{t("calm")}</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * Net sales, order count and (with reports.profit.read) gross profit for the
 * one selected period, from the same reports the Reports pages show.
 */
async function Performance({
  api,
  period,
  today,
  canSeeProfit,
}: {
  api: Api;
  period: HomePeriod;
  today: string;
  canSeeProfit: boolean;
}) {
  const t = await getTranslations("dashboard.performance");
  const locale = await getLocale();
  const [sales, profit] = await Promise.all([
    load(api.GET("/admin/reports/sales", { params: { query: { from: period.from, to: period.to, group_by: "day", per_page: 1 } } })),
    canSeeProfit
      ? load(api.GET("/admin/reports/profitability", { params: { query: { from: period.from, to: period.to, group_by: "department", per_page: 1 } } }))
      : null,
  ]);
  const range = `from=${period.from}&to=${period.to}`;
  const tiles: { id: string; label: string; value: string; href: string }[] = [];
  if (sales.ok) {
    tiles.push({ id: "perf-net-sales", label: t("netSales"), value: formatReportAmount(sales.data.totals.net_sales, locale), href: `/reports/sales?${range}&group_by=day` });
    tiles.push({ id: "perf-orders", label: t("orders"), value: new Intl.NumberFormat("en-US").format(sales.data.totals.order_count), href: `/reports/sales?${range}&group_by=day` });
  }
  if (profit?.ok) {
    tiles.push({ id: "perf-profit", label: t("profit"), value: formatReportAmount(profit.data.totals.gross_profit, locale), href: `/reports/profitability?${range}` });
  }
  return (
    <section className="mb-8" aria-labelledby="performance-title" data-testid="performance" data-period={period.kind}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="performance-title" className="text-section text-text">{t("title")}</h2>
          <p className="text-caption text-text-muted" data-testid="performance-range">
            <bdi dir="ltr">{period.from === period.to ? period.from : `${period.from} – ${period.to}`}</bdi>
          </p>
        </div>
        <PeriodSelector period={period} today={today} />
      </div>
      {tiles.length ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {tiles.map((tile) => (
            <Link key={tile.id} href={tile.href} data-testid={tile.id} className="group">
              <Card className="h-full p-4 transition-shadow group-hover:shadow-md">
                <p className="text-caption text-text-muted">{tile.label}</p>
                <p className="mt-1 text-page-title tabular-nums" data-testid={`${tile.id}-value`}>{tile.value}</p>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-body text-text-muted" data-testid="performance-unavailable">{t("unavailable")}</p>
      )}
      {profit?.ok ? (
        <p className="mt-2 text-caption text-text-muted" data-testid="profit-note">{t("profitNote")}</p>
      ) : null}
    </section>
  );
}

/** What the checklist needs, each fact null when the person may not read it. */
async function firstDayFacts(api: Api, permissions: readonly string[]) {
  const has = (key: string) => permissions.includes(key);
  const [tree, brands, products, openings, warehouses, suppliers, parties] = await Promise.all([
    has("catalog.categories") ? load(api.GET("/admin/categories")) : null,
    has("catalog.brands") ? load(api.GET("/admin/brands", { params: { query: { per_page: 1 } } })) : null,
    has("catalog.products") ? load(api.GET("/admin/products", { params: { query: { per_page: 1 } } })) : null,
    has("inventory.view") ? load(api.GET("/admin/inventory/openings", { params: { query: { per_page: 1 } } })) : null,
    has("inventory.view") ? load(api.GET("/admin/inventory/warehouses")) : null,
    has("suppliers.view") ? load(api.GET("/admin/suppliers", { params: { query: { per_page: 1 } } })) : null,
    has("drivers.manage") ? load(api.GET("/admin/delivery-parties", { params: { query: { per_page: 1, active: true } } })) : null,
  ]);
  return {
    subcategoryCount: tree?.ok
      ? tree.data.reduce((sum, department) => sum + (department.children?.length ?? 0), 0)
      : null,
    brandCount: brands?.ok ? brands.data.total : null,
    productCount: products?.ok ? products.data.total : null,
    openingCount: openings?.ok ? openings.data.total : null,
    sellableLocations: warehouses?.ok
      ? [...locationIndex(warehouses.data).values()].filter((info) => info.active && info.sellable).length
      : null,
    supplierCount: suppliers?.ok ? suppliers.data.total : null,
    partyCount: parties?.ok ? (parties.data.total ?? 0) : null,
  };
}
