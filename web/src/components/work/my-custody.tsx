"use client";

import { useLocale, useTranslations } from "next-intl";
import { PackageOpen, Truck } from "lucide-react";
import {
  AccountEmpty,
  AccountError,
  AccountSkeleton,
} from "@/components/account/states";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { api, ApiError, type DeliveryCustody } from "@/lib/api";
import { shortRef } from "@/lib/deliveries";
import { formatPrice } from "@/lib/format";
import { useStoreDateTime } from "@/lib/store-time";
import { useLatestRequest } from "@/lib/use-latest-request";
import { DeliveryStatusBadge } from "./delivery-status-badge";

/**
 * `custody: null`: the signed-in account is not a delivery party (the API's
 * 404). Wrapped, because a bare null would read as "still loading".
 */
async function loadCustody(): Promise<{ custody: DeliveryCustody | null }> {
  try {
    return { custody: await api.getMyCustody() };
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404)
      return { custody: null };
    throw cause;
  }
}

/**
 * The signed-in agent's own custody (API 11.2): the goods they hold, by
 * order and with how long they have held them, the cash they hold, and the
 * deliveries assigned to them. The server resolves the agent from the
 * session, so nobody else's custody can be asked for, and it sends no cost.
 */
export function MyCustody() {
  const t = useTranslations("custody");
  const tWork = useTranslations("work");
  const tDeliveries = useTranslations("deliveries");
  const locale = useLocale() as Locale;
  const dateTime = useStoreDateTime();
  const request = useLatestRequest("custody", loadCustody);
  // What is still theirs to do: assigned, on the way, or failed (to retry).
  const active = useLatestRequest("active", async () => {
    const pages = await Promise.all(
      (["assigned", "out_for_delivery", "failed"] as const).map((status) =>
        api.listAssignedDeliveries({ status, per_page: 50 }),
      ),
    );
    return pages.flatMap((page) => page.data);
  });
  const quantity = (value: number) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-IQ" : "en-US", {
      numberingSystem: "latn",
      maximumFractionDigits: 3,
    }).format(value);
  const days = (value: number | null) =>
    value === null ? "—" : t("days", { count: value });

  if (request.failed)
    return (
      <AccountError message={tWork("loadError")} onRetry={request.reload} />
    );
  if (request.loading || !request.data) return <AccountSkeleton rows={3} />;
  const custody = request.data.custody;
  if (custody === null) {
    return (
      <AccountEmpty
        icon={<PackageOpen className="size-7" aria-hidden />}
        title={t("noParty")}
        body={t("noPartyBody")}
      />
    );
  }
  const { goods, cash } = custody;

  return (
    <div
      className="flex flex-col gap-5"
      data-testid="my-custody"
      data-party={custody.party.id}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Card padding="md" className="flex flex-col gap-1">
          <span className="text-sm text-text-muted">{t("goodsQuantity")}</span>
          <span
            className="text-xl font-bold"
            dir="ltr"
            data-testid="my-custody-quantity"
          >
            {quantity(goods.quantity)}
          </span>
        </Card>
        <Card padding="md" className="flex flex-col gap-1">
          <span className="text-sm text-text-muted">{t("oldest")}</span>
          <span className="text-xl font-bold" data-testid="my-custody-oldest">
            {days(goods.oldest_age_days)}
          </span>
        </Card>
        <Card padding="md" className="flex flex-col gap-1">
          <span className="text-sm text-text-muted">{t("cash")}</span>
          <span className="text-xl font-bold" data-testid="my-custody-cash">
            {formatPrice(cash.amount, cash.currency, locale)}
          </span>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t("goodsTitle")}</h2>
        {goods.lines.length === 0 ? (
          <p className="text-sm text-text-muted" data-testid="my-custody-empty">
            {t("noGoods")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {goods.lines.map((line) => (
              <li key={line.holding_id}>
                <Card
                  padding="md"
                  className="flex flex-wrap items-center justify-between gap-3"
                  data-testid="my-custody-line"
                  data-order={line.order.order_number}
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-text">
                      {locale === "ar"
                        ? line.product.name_ar
                        : line.product.name_en}
                    </span>
                    <span className="text-sm text-text-muted">
                      {t("orderNumber", { number: line.order.order_number })} ·{" "}
                      <span dir="ltr">{line.sku}</span>
                      {line.lot_number ? (
                        <>
                          {" "}
                          · {t("lot")} <span dir="ltr">{line.lot_number}</span>
                        </>
                      ) : null}
                    </span>
                    <span className="text-xs text-text-muted">
                      {t("since", { at: dateTime(line.issued_at) })}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className="font-bold"
                      dir="ltr"
                      data-testid="my-custody-line-quantity"
                    >
                      {quantity(line.quantity)}
                    </span>
                    <span
                      className="text-xs text-text-muted"
                      data-testid="my-custody-line-age"
                    >
                      {days(line.age_days)}
                    </span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t("assignedTitle")}</h2>
        {active.failed ? (
          <AccountError message={tWork("loadError")} onRetry={active.reload} />
        ) : active.loading || !active.data ? (
          <AccountSkeleton rows={2} />
        ) : active.data.length === 0 ? (
          <AccountEmpty
            icon={<Truck className="size-7" aria-hidden />}
            title={t("noAssigned")}
            body={tDeliveries("emptyBody")}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {active.data.map((delivery) => (
              <li key={delivery.id}>
                <Link
                  href={`/deliveries/${delivery.id}`}
                  className="block rounded-lg"
                  data-testid="my-custody-delivery"
                  data-delivery-id={delivery.id}
                >
                  <Card
                    padding="md"
                    className="flex flex-wrap items-center justify-between gap-3 transition-colors hover:bg-card"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-bold text-text">
                        {tDeliveries("delivery", {
                          ref: shortRef(delivery.id ?? ""),
                        })}
                      </span>
                      <span className="text-sm text-text-muted">
                        {tDeliveries("order", {
                          ref: shortRef(delivery.order_id ?? ""),
                        })}
                      </span>
                    </div>
                    <DeliveryStatusBadge status={delivery.status} />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
