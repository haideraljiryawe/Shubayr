import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Download, History } from "lucide-react";
import { Badge, buttonClasses } from "@/components/ui";
import { commitOutcome, statusTone, type CatalogImportSummary } from "@/lib/catalog-import";
import { Table, TableCard, THead, TBody, Tr, Th, Td } from "@/components/table/table";
import { UrlTableFooter } from "@/components/table/table-footer";

/**
 * Past imports, newest first: when, who, the file, its state (partly applied
 * when a batch stopped it) and row counts, with links to reopen it and to
 * download its validation report.
 */
export function ImportHistory({
  rows,
  page,
  total,
  perPage,
  openedId,
  meId,
}: {
  rows: CatalogImportSummary[];
  page: number;
  total: number;
  perPage: number;
  openedId: string | null;
  meId: string | null;
}) {
  const t = useTranslations("catalogImport");
  const format = useFormatter();
  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" });
  const who = (item: CatalogImportSummary) =>
    item.created_by === meId ? t("history.you") : item.created_by_name || "—";
  const statusBadge = (item: CatalogImportSummary) => {
    const outcome = commitOutcome(item);
    return (
      <Badge tone={outcome === "partial" ? "warning" : statusTone(item.status)} data-testid="import-history-status" data-outcome={outcome}>
        {outcome === "none" ? t(`status.${item.status}`) : t(`outcome.${outcome}`)}
      </Badge>
    );
  };

  return (
    <TableCard
      data-testid="import-history"
      title={
        <h2 className="flex items-center gap-2 text-section">
          <History className="size-5 text-primary" aria-hidden />
          {t("history.title")}
        </h2>
      }
      footer={rows.length === 0 ? null : <UrlTableFooter total={total} page={page} perPage={perPage} />}
    >
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-body text-text-muted">{t("history.empty")}</p>
      ) : (
          <Table minWidth="640px">
            <THead>
              <Tr>
                <Th>{t("history.columns.when")}</Th>
                <Th>{t("history.columns.file")}</Th>
                <Th>{t("history.columns.who")}</Th>
                <Th>{t("history.columns.status")}</Th>
                <Th>{t("history.columns.counts")}</Th>
                <Th>
                  <span className="sr-only">{t("history.columns.actions")}</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((item) => (
                <Tr
                  key={item.id}
                  className={`border-t border-border ${item.id === openedId ? "bg-primary/5" : ""}`}
                  data-testid="import-history-row"
                  data-id={item.id}
                  data-status={item.status}
                >
                  <Td className="whitespace-nowrap">{when(item.created_at)}</Td>
                  <Td className="max-w-56 truncate" dir="auto" title={item.file_name}>
                    {item.file_name}
                  </Td>
                  <Td data-testid="import-history-who">
                    {who(item)}
                  </Td>
                  <Td>
                    {statusBadge(item)}
                  </Td>
                  <Td className="whitespace-nowrap text-text-muted" data-testid="import-history-counts">
                    {t("history.counts", {
                      create: item.create_count,
                      update: item.update_count,
                      warning: item.warning_count,
                      error: item.error_count,
                    })}
                    {item.operation_id ? <span className="block">{t("history.applied", { count: item.applied_count })}</span> : null}
                  </Td>
                  <Td>
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
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
      )}
    </TableCard>
  );
}
