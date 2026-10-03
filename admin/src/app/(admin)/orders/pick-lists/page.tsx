import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Alert } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { PickListSheet } from "@/components/orders/pick-list-sheet";
import { load, serverApi } from "@/lib/api/server";
import { UUID } from "@/lib/inventory";
import type { RawSearchParams } from "@/lib/table-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("orders.pickList");
  return { title: t("batchTitleShort") };
}

/**
 * A printable batch of pick lists for the orders chosen on the orders list
 * (`?ids=a,b,c`), built by POST /admin/pick-lists/print (inventory.pick).
 */
export default async function BatchPickListPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("orders");
  const raw = (await searchParams).ids;
  const ids = [...new Set((typeof raw === "string" ? raw : "").split(",").filter((id) => UUID.test(id)))].slice(0, 50);
  if (ids.length === 0) {
    return <Alert data-testid="pick-batch-empty">{t("pickList.chooseOrders")}</Alert>;
  }
  const api = await serverApi();
  const batch = await load(api.POST("/admin/pick-lists/print", { body: { order_ids: ids } }));
  if (!batch.ok) return <PageError error={batch.error} />;
  return (
    <>
      <Link href="/orders" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline print:hidden">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("back")}
      </Link>
      <PickListSheet lists={batch.data.data} generatedAt={batch.data.generated_at} />
    </>
  );
}
