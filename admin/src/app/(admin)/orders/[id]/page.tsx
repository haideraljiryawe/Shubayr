import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { OrderDetailView } from "./order-detail";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("orders") };
}

const UUID = /^[0-9a-fA-F-]{36}$/;

/**
 * One order: its lines, customer, delivery, timeline and — for this staff
 * member, in this order's state — the moves they may make.
 *
 * Permissions are read from GET /me on every render, never cached, so a
 * grant or revocation shows in the buttons on the next refresh.
 */
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const api = await serverApi();
  const [order, me, settings] = await Promise.all([
    load(api.GET("/admin/orders/{id}", { params: { path: { id } } })),
    load(api.GET("/me")),
    load(api.GET("/settings")),
  ]);
  if (!order.ok) {
    if (order.error.status === 404) notFound();
    return <PageError error={order.error} />;
  }
  const permissions = me.ok ? (me.data.permissions ?? []) : [];

  return (
    <OrderDetailView
      order={order.data}
      permissions={permissions}
      currency={settings.ok ? (settings.data.currency ?? "USD") : "USD"}
    />
  );
}
