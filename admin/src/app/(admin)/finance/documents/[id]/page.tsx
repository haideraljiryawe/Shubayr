import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { decimalPlaces } from "@/lib/finance/money";
import { DocumentView } from "./document-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("documents");
  return { title: t("title") };
}

const UUID = /^[0-9a-fA-F-]{36}$/;

/**
 * One posted financial document — an opening balance or a cash transfer
 * (contract 11.0: ledger.view or cash_accounts.view) — with a direct link
 * to the journal entry it posted.
 */
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const api = await serverApi();
  const [document, me] = await Promise.all([
    load(api.GET("/admin/financial-documents/{id}", { params: { path: { id } } })),
    load(api.GET("/me")),
  ]);
  if (!document.ok) {
    if (document.error.status === 404) notFound();
    return <PageError error={document.error} />;
  }
  const permissions = me.ok ? (me.data.permissions ?? []) : [];
  const canViewLedger = permissions.includes("ledger.view");

  // Display precision: currencies need fx_rates.view; cash accounts carry their
  // currency for a cash_accounts.view-only reader.
  const code = document.data.currency_code;
  let precision: number | undefined;
  if (canViewLedger) {
    const currencies = await load(api.GET("/admin/currencies"));
    precision = currencies.ok ? currencies.data.find((row) => row.code === code)?.display_precision : undefined;
  } else if (permissions.includes("cash_accounts.view")) {
    const accounts = await load(api.GET("/admin/cash-accounts"));
    precision = accounts.ok ? accounts.data.find((row) => row.currency_code === code)?.currency.display_precision : undefined;
  }

  return (
    <DocumentView
      document={document.data}
      precision={precision ?? decimalPlaces(String(document.data.amount))}
      canViewLedger={canViewLedger}
    />
  );
}
