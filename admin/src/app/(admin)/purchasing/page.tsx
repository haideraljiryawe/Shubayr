import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { PurchasingView } from "./purchasing-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("purchasing") };
}

export default async function PurchasingPage() {
  const t = await getTranslations("purchasing");
  const api = await serverApi();
  const [suppliers, invoices, products, warehouses] = await Promise.all([
    load(api.GET("/admin/suppliers", { params: { query: { page: 1, per_page: 100 } } })),
    load(api.GET("/admin/purchase-invoices", { params: { query: { page: 1, per_page: 50 } } })),
    load(api.GET("/admin/products", { params: { query: { page: 1, per_page: 100 } } })),
    load(api.GET("/admin/inventory/warehouses")),
  ]);

  if (!suppliers.ok) return <PageError error={suppliers.error} />;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <PurchasingView
        suppliers={suppliers.data.data}
        invoices={invoices.ok ? invoices.data.data : []}
        products={products.ok ? products.data.data : []}
        warehouses={warehouses.ok ? warehouses.data : []}
      />
    </>
  );
}
