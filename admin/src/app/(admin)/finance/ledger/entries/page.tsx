import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { EntriesView } from "./entries-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("ledger") };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-fA-F-]{36}$/;

/**
 * Journal entries (ledger.view), filtered and paged by the server: by
 * account, by source document, by date. Read-only.
 */
export default async function EntriesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("ledger");
  const params = parseTableParams(await searchParams, {
    sortKeys: ["accounting_date"],
    defaultSort: "accounting_date",
    defaultDir: "desc",
    filterKeys: ["account_code", "source_type", "source_id", "from", "to"],
  });
  const f = params.filters;
  const query = {
    page: params.page,
    per_page: params.perPage,
    ...(f.account_code ? { account_code: f.account_code } : {}),
    ...(f.source_type ? { source_type: f.source_type } : {}),
    ...(f.source_id && UUID.test(f.source_id) ? { source_id: f.source_id } : {}),
    ...(f.from && DAY.test(f.from) ? { from: f.from } : {}),
    ...(f.to && DAY.test(f.to) ? { to: f.to } : {}),
  };

  const api = await serverApi();
  const [entries, accounts, currencies] = await Promise.all([
    load(api.GET("/admin/ledger/entries", { params: { query } })),
    load(api.GET("/admin/ledger/trial-balance")),
    load(api.GET("/admin/currencies")),
  ]);
  if (!entries.ok) return <PageError error={entries.error} />;
  const balance = query.account_code
    ? await load(
        api.GET("/admin/ledger/accounts/{code}/balance", {
          params: { path: { code: query.account_code }, query: query.to ? { as_of: query.to } : {} },
        }),
      )
    : null;
  const base = currencies.ok ? currencies.data.find((currency) => currency.is_base) : undefined;
  const accountList = accounts.ok
    ? ((accounts.data.data ?? []) as Array<{ code: string; name_ar?: string; name_en?: string }>)
    : [];

  return (
    <>
      <PageHeader title={t("entriesTitle")} description={t("entriesDescription")} />
      <EntriesView
        entries={entries.data}
        accounts={accountList.map((row) => ({ code: row.code, name_ar: row.name_ar ?? "", name_en: row.name_en ?? "" }))}
        balance={balance?.ok ? (balance.data as Record<string, unknown>) : null}
        baseCode={base?.code ?? "IQD"}
        basePrecision={base?.display_precision ?? 0}
        state={{ page: entries.data.page, perPage: entries.data.per_page, total: entries.data.total, sort: "accounting_date", dir: "desc" }}
      />
    </>
  );
}
