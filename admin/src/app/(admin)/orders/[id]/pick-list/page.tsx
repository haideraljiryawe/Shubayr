import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageError } from "@/components/shell/page-error";
import { PickListSheet } from "@/components/orders/pick-list-sheet";
import { load, serverApi } from "@/lib/api/server";
import { UUID } from "@/lib/inventory";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("orders.pickList");
  return { title: t("title") };
}

/** One order's location-sorted pick list (inventory.pick), ready to print. */
export default async function OrderPickListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const t = await getTranslations("orders");
  const api = await serverApi();
  const list = await load(api.GET("/admin/orders/{id}/pick-list", { params: { path: { id } } }));
  if (!list.ok) {
    if (list.error.status === 404) notFound();
    return <PageError error={list.error} />;
  }
  return (
    <>
      <Link href={`/orders/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline print:hidden">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("back")}
      </Link>
      <PickListSheet lists={[list.data]} generatedAt={list.data.created_at ?? new Date().toISOString()} />
    </>
  );
}
