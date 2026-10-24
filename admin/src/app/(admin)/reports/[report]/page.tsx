import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Alert, Card, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { ReportChart } from "@/components/reports/report-chart";
import { ReportExport } from "@/components/reports/report-export";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportTable } from "@/components/reports/report-table";
import { loadReport } from "@/lib/api/reports-server";
import { load, serverApi } from "@/lib/api/server";
import { loadSupplierOptions } from "@/lib/api/purchasing-server";
import { storeDay } from "@/lib/finance/dates";
import { exportParameters, formatReportAmount, formatReportNumber, isReportId, reportQuery, reportView, REPORTS, type ReportCellKind } from "@/lib/reports";
import type { RawSearchParams } from "@/lib/table-params";

export async function generateMetadata({ params }: { params: Promise<{ report: string }> }): Promise<Metadata> {
  const { report } = await params;
  const t = await getTranslations("reports.names");
  return { title: isReportId(report) ? t(report) : t("sales") };
}

export default async function ReportPage({ params, searchParams }: { params: Promise<{ report: string }>; searchParams: Promise<RawSearchParams> }) {
  const { report } = await params;
  if (!isReportId(report)) notFound();
  const t = await getTranslations("reports");
  const locale = await getLocale();
  const definition = REPORTS[report];
  const query = reportQuery(report, await searchParams, storeDay());
  const api = await serverApi();

  let suppliers: Array<{ id: string; name: string }> = [];
  let warehouses: Array<{ id: string; name: string }> = [];
  let categories: Array<{ id: string; name: string }> = [];
  if (report === "supplier-statement" || report === "purchases") {
    const found = await loadSupplierOptions(api, String(query.supplier_id ?? "") || undefined);
    suppliers = found.suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }));
    if (report === "supplier-statement" && !query.supplier_id && suppliers[0]) query.supplier_id = suppliers[0].id;
  }
  if (report === "stock-movement") {
    const found = await load(api.GET("/admin/inventory/warehouses"));
    if (found.ok) warehouses = found.data.flatMap(({ id, name }) => id && name ? [{ id, name }] : []);
  }
  if (report === "expenses") {
    const found = await load(api.GET("/admin/expense-categories"));
    if (found.ok) categories = found.data.map((category) => ({ id: category.id, name: (locale === "ar" ? category.name_ar : category.name_en) || category.name_en || category.name_ar || "—" }));
  }

  const result = report === "supplier-statement" && !query.supplier_id ? null : await loadReport(api, report, query);
  if (result && !result.ok) return <PageError error={result.error} />;
  const view = result ? reportView(report, result.data, locale) : { columns: [], rows: [], totals: [], page: 1, perPage: 20, total: 0, touchesOpenPeriod: false, chart: [] };
  return (
    <div data-testid={`report-${report}`}>
      <PageHeader
        title={t(`names.${report}`)}
        description={t(`descriptions.${report}`)}
        actions={<ReportExport report={report} parameters={exportParameters(report, query)} />}
      />
      <ReportFilters definition={definition} query={query} suppliers={suppliers} warehouses={warehouses} categories={categories} />
      {view.touchesOpenPeriod ? <Alert tone="info" className="mb-6" data-testid="open-period-notice">{t("openPeriod")}</Alert> : null}
      {view.totals.length ? <Totals totals={view.totals} locale={locale} /> : null}
      {view.chart.length ? <ReportChart points={view.chart} kind={report === "expenses" ? "bar" : "line"} label={t(report === "expenses" ? "expenseChart" : "salesChart")} /> : null}
      {report === "supplier-statement" && !query.supplier_id ? <Alert tone="info" className="mb-4">{t("chooseSupplier")}</Alert> : null}
      <ReportTable view={view} />
    </div>
  );
}

async function Totals({ totals, locale }: { totals: Array<{ key: string; value: string | number | boolean | null; kind?: ReportCellKind }>; locale: string }) {
  const t = await getTranslations("reports");
  return (
    <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("totals")} data-testid="report-totals">
      {totals.map((total) => (
        <Card key={total.key} className="p-4">
          <p className="text-caption font-semibold text-text-muted">{t(`fields.${total.key}`)}</p>
          <p className="mt-1 text-section tabular-nums" data-testid={`report-total-${total.key}`}>
            {total.kind === "money" ? formatReportAmount(total.value as string | number | null, locale) : typeof total.value === "boolean" ? t(total.value ? "yes" : "no") : formatReportNumber(total.value as string | number | null, locale)}
          </p>
        </Card>
      ))}
    </section>
  );
}
