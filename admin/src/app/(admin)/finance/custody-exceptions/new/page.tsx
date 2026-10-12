import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions, loadWarehouses } from "@/lib/api/inventory-server";
import { loadBackdatingWindow, loadCashAccounts } from "@/lib/api/purchasing-server";
import { ApiError } from "@/lib/api/errors";
import { load, serverApi } from "@/lib/api/server";
import { EXCEPTION_PERMISSION, EXCEPTION_TYPES, type ExceptionType } from "@/lib/finance/custody-exceptions";
import { storeDay } from "@/lib/finance/dates";
import { UUID } from "@/lib/inventory";
import type { RawSearchParams } from "@/lib/table-params";
import { ExceptionForm } from "./exception-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("custodyExceptions.create");
  return { title: t("title") };
}

/**
 * Record a custody exception for one order (contract 13.3): goods lost or
 * damaged in the party's custody, goods returned at the door, or a refund of
 * the delivery fee. Opened from the order, the party's page or a trip, with
 * the order (and optionally the kind) in the URL. Each kind needs its own
 * permission; the page offers only the kinds the user may record.
 */
export default async function NewCustodyExceptionPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("custodyExceptions.create");
  const raw = await searchParams;
  const orderId = typeof raw.order_id === "string" && UUID.test(raw.order_id) ? raw.order_id : "";
  if (!orderId) notFound();
  const api = await serverApi();
  const permissions = await loadPermissions(api);
  const allowed = EXCEPTION_TYPES.filter((type) => permissions.includes(EXCEPTION_PERMISSION[type]));
  if (allowed.length === 0) return <PageError error={new ApiError(403, "custody_exceptions.* required")} />;

  const order = await load(api.GET("/admin/orders/{id}", { params: { path: { id: orderId } } }));
  if (!order.ok) {
    if (order.error.status === 404) notFound();
    return <PageError error={order.error} />;
  }
  const partyId = order.data.delivery?.party?.id ?? null;
  const [custody, collections, refunds, cashAccounts, warehouses, windowDays] = await Promise.all([
    partyId ? load(api.GET("/admin/delivery-parties/{id}/custody", { params: { path: { id: partyId } } })) : null,
    partyId ? load(api.GET("/admin/delivery-parties/{id}/collections", { params: { path: { id: partyId }, query: { order_id: orderId } } })) : null,
    load(api.GET("/admin/custody-exceptions", { params: { query: { order_id: orderId, type: "delivery_fee_refund", status: "active", per_page: 100 } } })),
    permissions.includes("custody_exceptions.refund_delivery_fee") ? loadCashAccounts(api) : null,
    permissions.includes("custody_exceptions.return_uncollected") ? loadWarehouses(api) : null,
    loadBackdatingWindow(api),
  ]);
  if (custody && !custody.ok) return <PageError error={custody.error} />;
  const requested = typeof raw.type === "string" && (allowed as readonly string[]).includes(raw.type) ? (raw.type as ExceptionType) : allowed[0];

  return (
    <>
      <Link href={`/orders/${orderId}`} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("back", { number: order.data.order_number ?? "" })}
      </Link>
      <PageHeader title={t("title")} description={t("description")} />
      <ExceptionForm
        order={order.data}
        partyId={partyId}
        holdings={custody?.ok ? custody.data.goods.lines.filter((line) => line.order.id === orderId) : []}
        collection={collections?.ok ? (collections.data.data[0] ?? null) : null}
        refunds={refunds.ok ? refunds.data.data : []}
        cashAccounts={(cashAccounts ?? []).filter((account) => account.currency_code === "IQD" && account.is_active)}
        locations={
          warehouses
            ? [...warehouses.locations.values()].filter((location) => location.active).map((location) => ({ id: location.id, label: `${location.warehouseName} · ${location.code}` }))
            : []
        }
        allowed={allowed}
        initialType={requested}
        canDeliver={permissions.includes("orders.deliver")}
        canBackdate={permissions.includes("backdate.approve")}
        today={storeDay()}
        windowDays={windowDays}
      />
    </>
  );
}
