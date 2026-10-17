"use client";

import { useTranslations } from "next-intl";
import { Badge, type BadgeTone } from "@/components/ui";
import type { ReturnStatus } from "@/lib/returns";

const TONE: Record<ReturnStatus, BadgeTone> = {
  requested: "warning",
  approved: "info",
  partially_approved: "info",
  received: "info",
  inspected: "info",
  refunded: "success",
  completed: "success",
  rejected: "danger",
};

export function ReturnStatusBadge({ status, testId }: { status: ReturnStatus; testId?: string }) {
  const t = useTranslations("returns.statuses");
  return (
    <Badge tone={TONE[status]} data-testid={testId} data-status={status}>
      {t(status)}
    </Badge>
  );
}
