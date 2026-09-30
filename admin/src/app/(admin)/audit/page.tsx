import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { AUDIT_FILTER_KEYS, auditListQuery } from "@/lib/audit";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { AuditTable } from "./audit-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("audit") };
}

/**
 * The audit log (audit.view): who changed what, when and why — filtered and
 * paged by the API, newest first.
 */
export default async function AuditPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("audit");
  const params = parseTableParams(await searchParams, {
    sortKeys: ["created_at"],
    defaultSort: "created_at",
    defaultDir: "desc",
    filterKeys: AUDIT_FILTER_KEYS,
  });
  const { query, invalidRange } = auditListQuery(params);
  const api = await serverApi();
  const logs = await load(api.GET("/admin/audit-logs", { params: { query } }));
  if (!logs.ok) return <PageError error={logs.error} />;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <AuditTable
        rows={logs.data.data ?? []}
        invalidRange={invalidRange}
        state={{
          page: logs.data.page,
          perPage: logs.data.per_page,
          total: logs.data.total,
          sort: "created_at",
          dir: "desc",
        }}
      />
    </>
  );
}
