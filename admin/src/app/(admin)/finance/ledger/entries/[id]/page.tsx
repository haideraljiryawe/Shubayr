import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { EntryView } from "./entry-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("ledger") };
}

const UUID = /^[0-9a-fA-F-]{36}$/;

/**
 * One journal entry (ledger.view, contract 8.1): its lines, the document it
 * came from, and the entries it reverses or is reversed by — all as direct
 * links. Read-only.
 */
export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const api = await serverApi();
  const [entry, currencies] = await Promise.all([
    load(api.GET("/admin/ledger/entries/{id}", { params: { path: { id } } })),
    load(api.GET("/admin/currencies")),
  ]);
  if (!entry.ok) {
    if (entry.error.status === 404) notFound();
    return <PageError error={entry.error} />;
  }
  const base = currencies.ok ? currencies.data.find((currency) => currency.is_base) : undefined;
  const precisions = Object.fromEntries(
    (currencies.ok ? currencies.data : []).map((currency) => [currency.code, currency.display_precision]),
  );

  return (
    <EntryView
      entry={entry.data}
      baseCode={base?.code ?? "IQD"}
      basePrecision={base?.display_precision ?? 0}
      precisions={precisions}
    />
  );
}
