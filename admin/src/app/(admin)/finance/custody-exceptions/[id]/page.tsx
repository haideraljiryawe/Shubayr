import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { UUID } from "@/lib/inventory";
import { ExceptionView } from "./exception-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("custodyExceptions.detail");
  return { title: t("title") };
}

/** One custody exception document, its lines and postings, and its reversal (custody_exceptions.reverse). */
export default async function CustodyExceptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const t = await getTranslations("custodyExceptions.detail");
  const api = await serverApi();
  const [exception, permissions] = await Promise.all([load(api.GET("/admin/custody-exceptions/{id}", { params: { path: { id } } })), loadPermissions(api)]);
  if (!exception.ok) {
    if (exception.error.status === 404) notFound();
    return <PageError error={exception.error} />;
  }

  return (
    <>
      <Link href="/finance/custody-exceptions" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader title={<span dir="ltr" data-testid="exception-number">{exception.data.document_number}</span>} description={t("description")} />
      <ExceptionView
        exception={exception.data}
        canReverse={permissions.includes("custody_exceptions.reverse") && exception.data.status === "active"}
        canViewLedger={permissions.includes("ledger.view")}
      />
    </>
  );
}
