"use client";

import { useTranslations } from "next-intl";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { DeliveryStatus } from "@/lib/api";

const TONES: Record<DeliveryStatus, BadgeTone> = {
  assigned: "warning",
  out_for_delivery: "primary",
  delivered: "success",
  failed: "error",
  returned: "neutral",
};

export function DeliveryStatusBadge({ status }: { status?: DeliveryStatus }) {
  const t = useTranslations("work");
  if (!status) return null;
  return (
    <Badge tone={TONES[status]} data-testid="delivery-status" data-status={status}>
      {t(`deliveryStatus.${status}`)}
    </Badge>
  );
}
