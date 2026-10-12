"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui";
import { EXCEPTION_PERMISSION, EXCEPTION_TYPES } from "@/lib/finance/custody-exceptions";
import type { components } from "@/types/api";

/**
 * The order's custody exceptions: record one (each kind with its own
 * permission) and see those already recorded. Only for an order a delivery
 * party has carried, and only what the user may do.
 */
export function CustodyExceptionLinks({ order, permissions }: { order: components["schemas"]["AdminOrder"]; permissions: string[] }) {
  const t = useTranslations("custodyExceptions");
  const kinds = EXCEPTION_TYPES.filter((type) => permissions.includes(EXCEPTION_PERMISSION[type]));
  const canView = permissions.includes("custody_exceptions.view");
  if (!order.delivery?.party || (!kinds.length && !canView)) return null;
  return (
    <Card className="flex flex-col gap-2 p-5 text-sm" data-testid="order-exceptions">
      <h2 className="font-bold">{t("orderPanel.title")}</h2>
      <div className="flex flex-wrap gap-3">
        {kinds.map((kind) => (
          <Link key={kind} href={`/finance/custody-exceptions/new?order_id=${order.id}&type=${kind}`} className="font-semibold text-primary-dark hover:underline" data-testid={`order-exception-${kind}`}>
            {t(`orderPanel.record.${kind}`)}
          </Link>
        ))}
        {canView ? (
          <Link href={`/finance/custody-exceptions?order_id=${order.id}`} className="text-primary-dark hover:underline" data-testid="order-exceptions-list">
            {t("orderPanel.list")}
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
