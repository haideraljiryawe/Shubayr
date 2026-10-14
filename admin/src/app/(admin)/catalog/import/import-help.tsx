import { useTranslations } from "next-intl";
import { CircleHelp } from "lucide-react";
import { Badge } from "@/components/ui";
import { KNOWN_ISSUES, PRODUCT_COLUMNS, STOCK_COLUMNS } from "@/lib/catalog-import";

/**
 * What each template column means and how to fix the common errors, in the
 * screen's language. Collapsed by default so the steps stay in view; the
 * column list is one column on a tablet and two on a wide screen.
 */
export function ImportHelp({ open = false }: { open?: boolean }) {
  const t = useTranslations("catalogImport.help");
  const issues = useTranslations("catalogImport.issues");

  const columnList = (columns: typeof PRODUCT_COLUMNS | typeof STOCK_COLUMNS, prefix: "columns" | "stockColumns") => (
    <dl className="grid gap-3 lg:grid-cols-2">
      {columns.map((column) => (
        <div key={column.key} className="rounded-md border border-border bg-surface p-3">
          <dt className="flex flex-wrap items-center gap-2">
            <code dir="ltr" className="rounded bg-card px-1.5 py-0.5 text-xs font-semibold">
              {column.header}
            </code>
            <Badge tone={column.required ? "warning" : "neutral"}>{column.required ? t("required") : t("optional")}</Badge>
          </dt>
          <dd className="mt-1.5 text-sm leading-relaxed text-text-muted">{t(`${prefix}.${column.key}`)}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <details className="group rounded-lg border border-border bg-card/40 p-4" open={open} data-testid="import-help">
      <summary className="flex cursor-pointer items-center gap-2 font-semibold">
        <CircleHelp className="size-5 text-primary" aria-hidden />
        {t("title")}
      </summary>
      <div className="mt-4 flex flex-col gap-5 text-sm leading-relaxed">
        <p>{t("intro")}</p>
        <p>{t("sheets")}</p>
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">{t("productsTitle")}</h3>
          {columnList(PRODUCT_COLUMNS, "columns")}
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">{t("stockTitle")}</h3>
          {columnList(STOCK_COLUMNS, "stockColumns")}
        </section>
        <section className="flex flex-col gap-2" data-testid="import-help-errors">
          <h3 className="font-semibold">{t("errorsTitle")}</h3>
          <p className="text-text-muted">{t("errorsHint")}</p>
          <ul className="grid gap-2 lg:grid-cols-2">
            {KNOWN_ISSUES.map((code) => (
              <li key={code} className="rounded-md border border-border bg-surface p-3">
                <p className="font-semibold">{issues(`${code}.what`)}</p>
                <p className="mt-1 text-text-muted">{issues(`${code}.fix`)}</p>
                <code dir="ltr" className="mt-1 block text-xs text-text-muted">
                  {code}
                </code>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </details>
  );
}
