import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadWarehouses } from "@/lib/api/inventory-server";
import { listRows, load, serverApi } from "@/lib/api/server";
import { UUID } from "@/lib/inventory";
import { availableAction } from "@/lib/returns";
import { ReturnView, type CollectionChoice, type CustomerInfo, type LocationChoice } from "./return-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("returns.detail");
  return { title: t("title") };
}

type Api = Awaited<ReturnType<typeof serverApi>>;

/**
 * Where a custody refund can come from: the order's own delivery collection,
 * found through its delivery party (orders.view + deliveries.manage). The
 * return itself does not name it.
 */
async function loadCollection(api: Api, partyId: string | undefined, orderId: string): Promise<CollectionChoice | null> {
  if (!partyId) return null;
  const result = await load(api.GET("/admin/delivery-parties/{id}/collections", { params: { path: { id: partyId }, query: { order_id: orderId, per_page: 5 } } }));
  const collection = result.ok ? result.data.data.find((row) => row.order_id === orderId) : undefined;
  return collection ? { id: collection.id, collected: collection.collected_amount, status: collection.status, partyId } : null;
}

/**
 * One customer return: its lines and money, the step flow, and the one step
 * that is next — shown only to whoever holds its permission.
 */
export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const t = await getTranslations("returns.detail");
  const api = await serverApi();
  const [ret, me] = await Promise.all([load(api.GET("/returns/queue/{id}", { params: { path: { id } } })), load(api.GET("/me"))]);
  if (!ret.ok) {
    if (ret.error.status === 404) notFound();
    return <PageError error={ret.error} />;
  }
  const permissions = me.ok ? (me.data.permissions ?? []) : [];
  const action = availableAction(ret.data.status, permissions);
  // Permission names for "the next step needs …" (VIS-019); the registry needs roles.manage, else the key is shown.
  const registryRead = permissions.includes("roles.manage") ? await load(api.GET("/admin/permissions")) : null;
  const registry = registryRead?.ok ? registryRead.data : [];

  // The customer and the order's delivery come from the order (orders.view).
  const order = permissions.includes("orders.view") ? await load(api.GET("/admin/orders/{id}", { params: { path: { id: ret.data.order_id } } })) : null;
  const customer: CustomerInfo | null = order?.ok ? { name: order.data.customer.name, phone: order.data.customer.phone } : null;
  const deliveryFee = order?.ok ? (order.data.delivery_fee ?? null) : null;

  let locations: LocationChoice[] = [];
  if (action === "inspect") {
    const { locations: index } = await loadWarehouses(api);
    locations = [...index.values()].map((location) => ({
      id: location.id,
      code: location.code,
      warehouse: location.warehouseName,
      sellable: location.sellable,
      active: location.active,
    }));
  }

  let cashAccounts: Array<{ id: string; name: string }> | null = null;
  let collection: CollectionChoice | null = null;
  if (action === "refund") {
    if (permissions.includes("cash_accounts.view")) {
      const accounts = await load(api.GET("/admin/cash-accounts"));
      cashAccounts = accounts.ok ? listRows(accounts.data).filter((row) => row.is_active && row.currency_code === "IQD").map((row) => ({ id: row.id, name: row.name })) : [];
    }
    if (order?.ok && permissions.includes("deliveries.manage")) {
      collection = await loadCollection(api, order.data.delivery?.party?.id, ret.data.order_id);
    }
  }

  return (
    <>
      <Link href="/returns" className="mb-3 inline-flex items-center gap-1 text-label text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader title={<span dir="ltr" data-testid="return-number">{ret.data.document_number}</span>} description={t("description")} />
      <ReturnView
        ret={ret.data}
        permissions={permissions}
        action={action}
        customer={customer}
        deliveryFee={deliveryFee}
        locations={locations}
        cashAccounts={cashAccounts}
        collection={collection}
        registry={registry}
      />
    </>
  );
}
