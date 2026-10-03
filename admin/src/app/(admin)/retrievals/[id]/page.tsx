import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions, loadWarehouses } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { UUID } from "@/lib/inventory";
import { RetrievalView } from "./retrieval-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("retrievals");
  return { title: t("title") };
}

/**
 * One retrieval document (retrieval.view): goods coming back from an
 * agent's custody after a failed delivery or a cancellation after dispatch.
 * They are received in full or in part (retrieval.receive), each receipt at
 * the original issue cost.
 */
export default async function RetrievalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const t = await getTranslations("retrievals");
  const api = await serverApi();
  const [retrieval, permissions, { locations }] = await Promise.all([
    load(api.GET("/admin/retrievals/{id}", { params: { path: { id } } })),
    loadPermissions(api),
    loadWarehouses(api),
  ]);
  if (!retrieval.ok) {
    if (retrieval.error.status === 404) notFound();
    return <PageError error={retrieval.error} />;
  }
  return (
    <>
      <Link href={`/orders/${retrieval.data.order_id}`} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("backToOrder")}
      </Link>
      <PageHeader title={<span dir="ltr" data-testid="retrieval-number">{retrieval.data.document_number}</span>} description={t("description")} />
      <RetrievalView
        key={`${retrieval.data.id}:${retrieval.data.status}`}
        retrieval={retrieval.data}
        locations={[...locations.values()].filter((info) => info.active)}
        canReceive={permissions.includes("retrieval.receive")}
        canViewLedger={permissions.includes("ledger.view")}
        canViewCost={permissions.includes("cost.view")}
      />
    </>
  );
}
