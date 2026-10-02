"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui";
import type { AdminOrder } from "@/lib/orders";

/**
 * What needs someone's attention on an order, beside its status: late for
 * acceptance (the business-hours deadline passed while it waited), a
 * preparation shortage, a customer's pending cancellation request.
 */
export function OrderFlags({
  order,
}: {
  order: Pick<AdminOrder, "status" | "late_for_acceptance" | "inventory_attention_required" | "cancellation_request">;
}) {
  const t = useTranslations("orders.badges");
  return (
    <>
      {order.late_for_acceptance && order.status === "pending" ? (
        <Badge tone="danger" data-testid="flag-late">{t("late")}</Badge>
      ) : null}
      {order.inventory_attention_required ? (
        <Badge tone="warning" data-testid="flag-attention">{t("attention")}</Badge>
      ) : null}
      {order.cancellation_request?.status === "pending" ? (
        <Badge tone="warning" data-testid="flag-cancel-requested">{t("cancelRequested")}</Badge>
      ) : null}
    </>
  );
}
