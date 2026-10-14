import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Download, History } from "lucide-react";
import { Badge, buttonClasses, Card } from "@/components/ui";
import { statusTone, type CatalogImportSummary } from "@/lib/catalog-import";

/**
 * Past imports, newest first: when, who, the file, its state and row counts,
 * with links to reopen it and to download its validation report.
 */
export function ImportHistory({
  rows,
  page,
  total,
  perPage,
  openedId,
  meId,
  people,
}: {
  rows: CatalogImportSummary[];
  page: number;
  total: number;
  perPage: number;
  openedId: string | null;
  meId: string | null;
  /** Staff names by id (empty without users.manage). */
  people: Record<string, string>;
}) {
  const t = useTranslations("catalogImport");
  const format = useFormatter();
  const pages = Math.max(1, Math.ceil(total / perPage));
  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" });
  const who = (item: CatalogImportSummary) =>
    item.created_by === meId ? t("history.you") : item.created_by_name || people[item.created_by] || "—";
  const pageHref = (target: number) => `/catalog/import?page=${target}${openedId ? `&id=${openedId}` : ""}`;

  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="import-history">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <History className="size-5 text-primary" aria-hidden />
        {t("history.title")}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">{t("history.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-start text-text-muted">
              <tr>
                <th className="p-2 text-start font-medium">{t("history.columns.when")}</th>
                <th className="p-2 text-start font-medium">{t("history.columns.file")}</th>
                <th className="p-2 text-start font-medium">{t("history.columns.who")}</th>
                <th className="p-2 text-start font-medium">{t("history.columns.status")}</th>
                <th className="p-2 text-start font-medium">{t("history.columns.counts")}</th>
                <th className="p-2 text-start font-medium">
                  <span className="sr-only">{t("history.columns.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr
                  key={item.id}
                  className={`border-t border-border ${item.id === openedId ? "bg-primary/5" : ""}`}
                  data-testid="import-history-row"
                  data-id={item.id}
                  data-status={item.status}
                >
                  <td className="whitespace-nowrap p-2">{when(item.created_at)}</td>
                  <td className="max-w-56 truncate p-2" dir="auto" title={item.file_name}>
                    {item.file_name}
                  </td>
                  <td className="p-2" data-testid="import-history-who">
                    {who(item)}
                  </td>
                  <td className="p-2">
                    <Badge tone={statusTone(item.status)}>{t(`status.${item.status}`)}</Badge>
                  </td>
                  <td className="whitespace-nowrap p-2 text-text-muted" data-testid="import-history-counts">
                    {t("history.counts", {
                      create: item.create_count,
                      update: item.update_count,
                      warning: item.warning_count,
                      error: item.error_count,
                    })}
                  </td>
                  <td className="p-2">
                    <div className="flex items-center justify-end gap-1">
                      {item.error_report_key ? (
                        <a
                          href={`/api/catalog-imports/${item.id}/error-report`}
                          className={buttonClasses({ variant: "ghost", size: "sm" })}
                          download
                          data-testid="import-history-report"
                        >
                          <Download className="size-4" aria-hidden />
                          {t("history.report")}
                        </a>
                      ) : null}
                      {item.id === openedId ? (
                        <span className="px-2 text-xs text-text-muted">{t("history.opened")}</span>
                      ) : (
                        <Link
                          href={`/catalog/import?id=${item.id}`}
                          className={buttonClasses({ variant: "secondary", size: "sm" })}
                          data-testid="import-history-open"
                        >
                          {t("history.open")}
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <nav className="flex items-center justify-end gap-2 text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={buttonClasses({ variant: "ghost", size: "sm" })}>
              {t("history.previous")}
            </Link>
          ) : null}
          <span className="text-text-muted" dir="ltr">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Link href={pageHref(page + 1)} className={buttonClasses({ variant: "ghost", size: "sm" })}>
              {t("history.next")}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </Card>
  );
}
