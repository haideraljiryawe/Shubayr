import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { ApiError } from "@/lib/api/errors";
import { loadPermissions } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { UUID } from "@/lib/inventory";
import { DecisionForm } from "./decision-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("priceApprovals");
  return { title: t("title") };
}

/**
 * Inspect a fixed or linked below-cost price publish and, with the approval
 * permission, approve or reject it. The proposer is recorded by the server from their session
 * and can never decide their own request; nothing here sends who proposed it.
 */
export default async function PriceApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("priceApprovals");
  const api = await serverApi();
  const permissions = await loadPermissions(api);
  const mayRead = ["sell_below_cost.approve", "prices.change", "prices.publish_linked"].some((permission) => permissions.includes(permission));
  if (!mayRead) return <PageError error={new ApiError(403, "Price approval permission required")} />;
  if (!UUID.test(id)) return <PageError error={new ApiError(404, "Unknown approval request")} />;
  const approval = await load(api.GET("/admin/price-publish-approvals/{id}", { params: { path: { id } } }));
  if (!approval.ok) return <PageError error={approval.error} />;
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <DecisionForm id={id} approval={approval.data} canDecide={permissions.includes("sell_below_cost.approve")} canViewCost={permissions.includes("cost.view")} />
    </>
  );
}
