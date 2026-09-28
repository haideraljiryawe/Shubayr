"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Info, Loader2, Truck } from "lucide-react";
import { AccountError, AccountSkeleton } from "@/components/account/states";
import { useTheme } from "@/components/providers/theme-provider";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { api, ApiError, type Delivery } from "@/lib/api";
import {
  DELIVERY_TRANSITIONS,
  findAssignedDelivery,
  shortRef,
  type DeliveryAction,
} from "@/lib/deliveries";
import { formatPrice } from "@/lib/format";
import { useStoreDateTime } from "@/lib/store-time";
import { useResource } from "@/lib/use-resource";
import { DeliveryStatusBadge } from "./delivery-status-badge";

/**
 * One delivery and the moves the API allows on it right now.
 *
 * Each move asks once before it is sent — they cannot be undone from here.
 * If the server refuses with 409 (the delivery or its order changed since
 * this page loaded — a staff handover, a reassignment, another device) the
 * page reloads the delivery and says so, rather than leaving a stale status
 * on screen next to a button that will fail again.
 */
export function DeliveryDetail({ deliveryId }: { deliveryId: string }) {
  const t = useTranslations("deliveries");
  const tWork = useTranslations("work");
  const locale = useLocale() as Locale;
  const { currency } = useTheme();
  const showToast = useToast();
  const dateTime = useStoreDateTime();

  const { data, failed, reload } = useResource<Delivery | { notFound: true }>(
    async () => (await findAssignedDelivery(deliveryId)) ?? { notFound: true },
    [deliveryId],
  );
  // A successful move replaces the loaded delivery until the next reload.
  const [updated, setUpdated] = useState<Delivery | null>(null);
  const [confirming, setConfirming] = useState<DeliveryAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<"conflict" | "failed" | null>(null);

  const back = (
    <Link
      href="/deliveries"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-dark"
    >
      <ArrowLeft className="size-4 rtl-flip" aria-hidden />
      {t("backToList")}
    </Link>
  );

  if (failed) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <AccountError message={tWork("loadError")} onRetry={reload} />
      </div>
    );
  }
  if (!data) return <AccountSkeleton rows={2} />;
  if ("notFound" in data) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        {notice === "conflict" ? <ConflictNotice text={t("conflict")} /> : null}
        <Card padding="lg" className="text-center" data-testid="delivery-not-found">
          <Truck className="mx-auto size-10 text-text-muted" aria-hidden />
          <h2 className="mt-3 text-lg font-bold text-text">{t("notFound")}</h2>
          <p className="mt-2 text-sm text-text-muted">{t("notFoundBody")}</p>
          <Link
            href="/deliveries"
            className={buttonClasses({ variant: "secondary", className: "mt-5" })}
          >
            {t("backToList")}
          </Link>
        </Card>
      </div>
    );
  }

  const delivery =
    updated && updated.id === data.id ? updated : data;
  const actions = delivery.status ? DELIVERY_TRANSITIONS[delivery.status] : [];

  async function perform(action: DeliveryAction) {
    setSaving(true);
    setNotice(null);
    try {
      const next = await api.updateDeliveryStatus(deliveryId, action);
      setUpdated(next);
      setConfirming(null);
      showToast(t("done"));
    } catch (cause) {
      setConfirming(null);
      if (
        cause instanceof ApiError &&
        (cause.status === 409 || cause.status === 403 || cause.status === 404)
      ) {
        // Stale state: show what the server holds now, and why.
        setNotice("conflict");
        setUpdated(null);
        reload();
      } else {
        setNotice("failed");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="delivery-detail">
      {back}

      {notice === "conflict" ? <ConflictNotice text={t("conflict")} /> : null}
      {notice === "failed" ? (
        <p className="rounded-md bg-error/10 p-3 text-sm text-error-dark" role="alert">
          {t("failedSave")}
        </p>
      ) : null}

      <Card padding="md" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold text-text">
            {t("delivery", { ref: shortRef(delivery.id ?? "") })}
          </h2>
          <span className="text-sm text-text-muted">
            {t("order", { ref: shortRef(delivery.order_id ?? "") })}
          </span>
        </div>
        <DeliveryStatusBadge status={delivery.status} />
      </Card>

      <Card padding="md">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-text-muted">{t("fee")}</dt>
            <dd className="font-semibold text-text">
              {formatPrice(delivery.delivery_fee ?? 0, currency, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("dispatchedAt")}</dt>
            <dd className="text-text">
              {dateTime(delivery.dispatched_at) || t("notYet")}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("deliveredAt")}</dt>
            <dd className="text-text">
              {dateTime(delivery.delivered_at) || t("notYet")}
            </dd>
          </div>
        </dl>
        <p className="mt-4 flex items-start gap-2 text-xs text-text-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("detailsNote")}
        </p>
      </Card>

      <Card padding="md" className="flex flex-col gap-3" data-testid="delivery-actions">
        <h3 className="font-bold text-text">{t("actions")}</h3>
        {actions.length === 0 ? (
          <p className="text-sm text-text-muted" data-testid="delivery-no-actions">
            {t("noActions")}
          </p>
        ) : confirming ? (
          <div
            className="flex flex-col gap-3 rounded-md border border-border p-3"
            role="alertdialog"
            aria-label={t(`confirm.${confirming}`)}
            data-testid="delivery-confirm"
          >
            <p className="text-text">{t(`confirm.${confirming}`)}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={confirming === "failed" ? "secondary" : "primary"}
                disabled={saving}
                onClick={() => void perform(confirming)}
                data-testid="delivery-confirm-yes"
                startIcon={
                  saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null
                }
              >
                {saving ? t("saving") : t("confirmYes")}
              </Button>
              <Button
                variant="ghost"
                disabled={saving}
                onClick={() => setConfirming(null)}
                data-testid="delivery-confirm-no"
              >
                {t("confirmNo")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button
                key={action}
                variant={action === "failed" || action === "returned" ? "secondary" : "primary"}
                onClick={() => {
                  setNotice(null);
                  setConfirming(action);
                }}
                data-testid={`delivery-action-${action}`}
              >
                {t(`action.${action}`)}
              </Button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ConflictNotice({ text }: { text: string }) {
  return (
    <p
      className="rounded-md bg-warning/15 p-3 text-sm text-text"
      role="alert"
      data-testid="delivery-conflict"
    >
      {text}
    </p>
  );
}
