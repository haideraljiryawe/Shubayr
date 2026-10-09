"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui";
import { tripRefusal, unresolvedOrderIds, type TripOrder } from "@/lib/trips";

/**
 * A trip refusal in words. A close refused while orders are unresolved lists
 * them (from the API's answer), each with what it still needs.
 */
export function TripRefusal({ error, orders = [] }: { error: unknown; orders?: TripOrder[] }) {
  const t = useTranslations("trips.refusals");
  const kind = tripRefusal(error);
  if (!kind) return null;
  const blocking = kind === "unresolved" ? unresolvedOrderIds(error) : [];
  return (
    <Alert data-testid="trip-refusal" data-kind={kind}>
      <p>{t(kind)}</p>
      {blocking.length ? (
        <ul className="mt-2 list-inside list-disc" data-testid="trip-blocking">
          {blocking.map((id) => {
            const order = orders.find((row) => row.id === id);
            return (
              <li key={id} data-testid="trip-blocking-order" data-order={order?.order_number ?? id}>
                <Link href={`/orders/${id}`} className="font-semibold underline" dir="ltr">
                  {order?.order_number ?? id.slice(0, 8)}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Alert>
  );
}
