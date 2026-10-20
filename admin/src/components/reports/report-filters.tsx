import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Button, Input, Select } from "@/components/ui";
import type { ReportDefinition, ReportQuery } from "@/lib/reports";

export async function ReportFilters({ definition, query, suppliers }: { definition: ReportDefinition; query: ReportQuery; suppliers?: Array<{ id: string; name: string }> }) {
  const t = await getTranslations("reports");
  return (
    <form className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4" method="get" data-testid="report-filters">
      {definition.dateMode === "period" ? (
        <>
          <Filter label={t("from")}><Input name="from" type="date" defaultValue={String(query.from)} required /></Filter>
          <Filter label={t("to")}><Input name="to" type="date" defaultValue={String(query.to)} required /></Filter>
        </>
      ) : <Filter label={t("asOf")}><Input name="as_of" type="date" defaultValue={String(query.as_of)} required /></Filter>}
      {definition.groups ? (
        <Filter label={t("groupBy")}>
          <Select name="group_by" defaultValue={String(query.group_by)}>
            {definition.groups.map((group) => <option key={group} value={group}>{t(`groups.${group}`)}</option>)}
          </Select>
        </Filter>
      ) : null}
      {definition.id === "inventory-valuation" ? <Filter label={t("slowDays")}><Input className="w-28" name="slow_days" type="number" min={1} max={3650} defaultValue={String(query.slow_days)} /></Filter> : null}
      {definition.id === "supplier-statement" ? (
        <Filter label={t("supplier")}>
          <Select name="supplier_id" defaultValue={String(query.supplier_id ?? "")} required>
            <option value="">{t("chooseSupplier")}</option>
            {(suppliers ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </Select>
        </Filter>
      ) : null}
      {definition.id === "expenses" ? <Filter label={t("payee")}><Input name="payee" defaultValue={String(query.payee ?? "")} maxLength={200} /></Filter> : null}
      <input type="hidden" name="per_page" value={String(query.per_page)} />
      <Button type="submit" data-testid="report-apply">{t("apply")}</Button>
    </form>
  );
}

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex min-w-40 flex-col gap-1 text-sm font-semibold"><span>{label}</span>{children}</label>;
}

