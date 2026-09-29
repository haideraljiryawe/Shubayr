"use client";

import { useTranslations } from "next-intl";
import { Badge, type BadgeTone } from "@/components/ui";
import type { OrderStatus } from "@/lib/orders";

const TONES: Record<OrderStatus, BadgeTone> = {
  pending: "warning",
  confirmed: "info",
  preparing: "info",
  ready_for_dispatch: "info",
  dispatched: "info",
  delivered: "success",
  failed: "danger",
  rejected: "danger",
  cancelled: "danger",
  return_requested: "warning",
  returned: "neutral",
};

export function OrderStatusBadge({ status }: { status?: OrderStatus | null }) {
  const t = useTranslations("orders");
  if (!status) return null;
  return (
    <Badge tone={TONES[status]} data-testid="order-status" data-status={status}>
      {t(`status.${status}`)}
    </Badge>
  );
}
