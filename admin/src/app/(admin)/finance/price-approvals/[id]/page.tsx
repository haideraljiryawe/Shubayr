import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { ApiError } from "@/lib/api/errors";
import { loadPermissions } from "@/lib/api/inventory-server";
import { serverApi } from "@/lib/api/server";
import { UUID } from "@/lib/inventory";
import { DecisionForm } from "./decision-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("priceApprovals");
  return { title: t("title") };
}

/**
 * Approve or reject a below-cost linked-price publish (sell_below_cost.approve,
 * contract 11.0). The proposer is recorded by the server from their session
 * and can never decide their own request; nothing here sends who proposed it.
 *
 * The API has no read of a single request or list of pending ones yet, so an
 * approver arrives here from the link the proposer shares (see the PR notes).
 */
export default async function PriceApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("priceApprovals");
  const permissions = await loadPermissions(await serverApi());
  if (!permissions.includes("sell_below_cost.approve")) return <PageError error={new ApiError(403, "sell_below_cost.approve required")} />;
  if (!UUID.test(id)) return <PageError error={new ApiError(404, "Unknown approval request")} />;
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <DecisionForm id={id} canViewCost={permissions.includes("cost.view")} />
    </>
  );
}
