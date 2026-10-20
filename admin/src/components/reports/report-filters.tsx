import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Button, Input, Select } from "@/components/ui";
import type { ReportDefinition, ReportQuery } from "@/lib/reports";

type Option = { id: string; name: string };

export async function ReportFilters({ definition, query, suppliers, warehouses, categories }: { definition: ReportDefinition; query: ReportQuery; suppliers?: Option[]; warehouses?: Option[]; categories?: Option[] }) {
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
      {definition.id === "supplier-statement" || definition.id === "purchases" ? (
        <Filter label={t("supplier")}>
          <Select name="supplier_id" defaultValue={String(query.supplier_id ?? "")} required={definition.id === "supplier-statement"}>
            <option value="">{definition.id === "supplier-statement" ? t("chooseSupplier") : t("allSuppliers")}</option>
            {(suppliers ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </Select>
        </Filter>
      ) : null}
      {definition.id === "purchases" ? <><Filter label={t("variantId")}><Input name="variant_id" defaultValue={String(query.variant_id ?? "")} /></Filter><Filter label={t("categoryId")}><Input name="category_id" defaultValue={String(query.category_id ?? "")} /></Filter></> : null}
      {definition.id === "stock-movement" ? <><Filter label={t("warehouse")}><Select name="warehouse_id" defaultValue={String(query.warehouse_id ?? "")}><option value="">{t("allWarehouses")}</option>{(warehouses ?? []).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</Select></Filter><Filter label={t("variantId")}><Input name="variant_id" defaultValue={String(query.variant_id ?? "")} /></Filter></> : null}
      {definition.id === "expenses" ? <><Filter label={t("category")}><Select name="category_id" defaultValue={String(query.category_id ?? "")}><option value="">{t("allCategories")}</option>{(categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Filter><Filter label={t("payee")}><Input name="payee" defaultValue={String(query.payee ?? "")} maxLength={200} /></Filter></> : null}
      {query.per_page !== undefined ? <input type="hidden" name="per_page" value={String(query.per_page)} /> : null}
      <Button type="submit" data-testid="report-apply">{t("apply")}</Button>
    </form>
  );
}

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex min-w-40 flex-col gap-1 text-sm font-semibold"><span>{label}</span>{children}</label>;
}

