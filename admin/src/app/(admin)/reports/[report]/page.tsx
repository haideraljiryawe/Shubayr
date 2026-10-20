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
  if (report === "supplier-statement") {
    const found = await load(api.GET("/admin/suppliers", { params: { query: { per_page: 100, sort: "name", dir: "asc" } } }));
    if (found.ok) suppliers = found.data.data.map((supplier) => ({ id: supplier.id, name: supplier.name }));
    if (!query.supplier_id && suppliers[0]) query.supplier_id = suppliers[0].id;
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
      <ReportFilters definition={definition} query={query} suppliers={suppliers} />
      {view.touchesOpenPeriod ? <Alert tone="info" className="mb-6" data-testid="open-period-notice">{t("openPeriod")}</Alert> : null}
      {view.totals.length ? <Totals totals={view.totals} locale={locale} /> : null}
      {view.chart.length ? <ReportChart points={view.chart} kind={report === "expenses" ? "bar" : "line"} label={t(report === "expenses" ? "expenseChart" : "salesChart")} /> : null}
      {report === "supplier-statement" && !query.supplier_id ? <Alert tone="info">{t("chooseSupplier")}</Alert> : <ReportTable view={view} />}
    </div>
  );
}

async function Totals({ totals, locale }: { totals: Array<{ key: string; value: string | number | boolean | null; kind?: ReportCellKind }>; locale: string }) {
  const t = await getTranslations("reports");
  return (
    <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("totals")} data-testid="report-totals">
      {totals.map((total) => (
        <Card key={total.key} className="p-4">
          <p className="text-xs font-semibold text-text-muted">{t(`fields.${total.key}`)}</p>
          <p className="mt-1 text-lg font-bold tabular-nums" data-testid={`report-total-${total.key}`}>
            {total.kind === "money" ? formatReportAmount(total.value as string | number | null, locale) : typeof total.value === "boolean" ? t(total.value ? "yes" : "no") : formatReportNumber(total.value as string | number | null, locale)}
          </p>
        </Card>
      ))}
    </section>
  );
}
