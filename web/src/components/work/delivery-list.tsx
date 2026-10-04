"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Truck } from "lucide-react";
import {
  AccountEmpty,
  AccountError,
  AccountSkeleton,
} from "@/components/account/states";
import { useTheme } from "@/components/providers/theme-provider";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { api, type DeliveryStatus } from "@/lib/api";
import { cn } from "@/lib/cn";
import { shortRef } from "@/lib/deliveries";
import { formatPrice } from "@/lib/format";
import { useStoreDateTime } from "@/lib/store-time";
import { useLatestRequest } from "@/lib/use-latest-request";
import { DeliveryStatusBadge } from "./delivery-status-badge";
import { Pager } from "./pager";

const CHIPS: Array<DeliveryStatus | "all"> = [
  "all",
  "assigned",
  "out_for_delivery",
  "delivered",
  "failed",
  "returned",
];

const PER_PAGE = 20;

/** The signed-in agent's deliveries — and only theirs; the server scopes it. */
export function DeliveryList() {
  const t = useTranslations("deliveries");
  const tWork = useTranslations("work");
  const locale = useLocale() as Locale;
  const { currency } = useTheme();
  const dateTime = useStoreDateTime();
  const [status, setStatus] = useState<DeliveryStatus | "all">("all");
  const [page, setPage] = useState(1);

  const deliveries = useLatestRequest(`${status}:${page}`, () =>
    api.listAssignedDeliveries({
      status: status === "all" ? undefined : status,
      page,
      per_page: PER_PAGE,
    }),
  );
  const data = deliveries.data;

  return (
    <div className="flex flex-col gap-5" data-testid="delivery-list">
      <div
        role="group"
        aria-label={t("statusFilter")}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {CHIPS.map((chip) => (
          <Chip
            key={chip}
            selected={status === chip}
            onClick={() => {
              setStatus(chip);
              setPage(1);
            }}
            data-testid={`delivery-chip-${chip}`}
            className="shrink-0"
          >
            {tWork(`deliveryStatus.${chip}`)}
          </Chip>
        ))}
      </div>

      {deliveries.failed ? (
        <AccountError
          message={tWork("loadError")}
          onRetry={deliveries.reload}
        />
      ) : deliveries.loading || !data ? (
        <AccountSkeleton rows={3} />
      ) : data.data.length === 0 ? (
        <AccountEmpty
          icon={<Truck className="size-7" aria-hidden />}
          title={t("empty")}
          body={t("emptyBody")}
        />
      ) : (
        <div
          className={cn(
            "flex flex-col gap-3",
            deliveries.stale && "opacity-60",
          )}
        >
          <ul className="flex flex-col gap-3">
            {data.data.map((delivery) => (
              <li key={delivery.id}>
                <Link
                  href={`/deliveries/${delivery.id}`}
                  data-testid="delivery-row"
                  data-delivery-id={delivery.id}
                  className="block rounded-lg"
                >
                  <Card
                    padding="md"
                    className="flex flex-wrap items-center justify-between gap-3 transition-colors hover:bg-card"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-bold text-text">
                        {t("delivery", { ref: shortRef(delivery.id ?? "") })}
                      </span>
                      <span className="text-sm text-text-muted">
                        {t("order", { ref: shortRef(delivery.order_id ?? "") })}
                      </span>
                      {delivery.dispatched_at ? (
                        <span className="text-xs text-text-muted">
                          {t("dispatchedAt")}:{" "}
                          {dateTime(delivery.dispatched_at)}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <DeliveryStatusBadge status={delivery.status} />
                      <span className="text-sm text-text-muted">
                        {t("fee")}:{" "}
                        {formatPrice(
                          delivery.delivery_fee ?? 0,
                          currency,
                          locale,
                        )}
                      </span>
                      <span className="text-sm font-semibold text-text">
                        {t("collection.due")}:{" "}
                        {formatPrice(delivery.amount_due, "IQD", locale)}
                      </span>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          <Pager
            page={data.page}
            perPage={data.per_page}
            total={data.total}
            onPage={setPage}
          />
        </div>
      )}
    </div>
  );
}
