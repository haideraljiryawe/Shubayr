"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { OrderStatus } from "@/lib/api";

/**
 * How each contract status reads to a customer. Colour follows meaning, not the
 * step number: anything in motion is informational, a finished order is a
 * success, and the failure states are the only red ones.
 */
export const ORDER_STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  pending: "warning",
  confirmed: "info",
  preparing: "info",
  ready_for_dispatch: "info",
  dispatched: "primary",
  delivered: "success",
  failed: "error",
  rejected: "error",
  cancelled: "error",
  return_requested: "warning",
  returned: "neutral",
};

export function statusLabelKey(status: OrderStatus): string {
  return `status_${status}`;
}

export function OrderStatusChip({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const t = useTranslations("orders");

  return (
    <Badge
      tone={ORDER_STATUS_TONES[status] ?? "neutral"}
      className={className}
      data-testid="order-status"
    >
      {t(statusLabelKey(status))}
    </Badge>
  );
}

/** Order dates render in the reading locale with Latin digits, like prices. */
export function useOrderDate(): (iso: string | undefined) => string {
  const format = useFormatter();

  return (iso) => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return format.dateTime(date, {
      day: "numeric",
      month: "long",
      year: "numeric",
      numberingSystem: "latn",
    });
  };
}

export function useOrderDateTime(): (iso: string | undefined) => string {
  const format = useFormatter();

  return (iso) => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return format.dateTime(date, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      numberingSystem: "latn",
    });
  };
}
