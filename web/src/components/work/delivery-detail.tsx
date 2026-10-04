"use client";

import { useRef, useState } from "react";
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
  CollectionOperation,
  parseCollectedAmount,
  type CollectionChoice,
} from "@/lib/collection";
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
  const [failureReason, setFailureReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<"conflict" | "failed" | null>(null);
  // The cash step of "delivered" (API 12.0).
  const [choice, setChoice] = useState<CollectionChoice>("confirmed");
  const [amountText, setAmountText] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const operation = useRef(new CollectionOperation());

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
    let collection;
    if (action === "delivered") {
      const amount = choice === "confirmed" ? parseCollectedAmount(amountText) : null;
      if (choice === "confirmed" && amount === null) {
        setAmountError(t("collection.amountInvalid"));
        return;
      }
      collection = operation.current.input(choice, amount);
    }
    setSaving(true);
    setNotice(null);
    setAmountError(null);
    try {
      const next = await api.updateDeliveryStatus(
        deliveryId,
        action,
        delivery.order_version,
        action === "failed" ? failureReason.trim() : undefined,
        collection,
      );
      setUpdated(next);
      setConfirming(null);
      setFailureReason("");
      setAmountText("");
      showToast(t("done"));
    } catch (cause) {
      if (action === "delivered" && cause instanceof ApiError && cause.status === 422) {
        // The amount was refused (above what is due, for one): say why, keep the step.
        setAmountError(cause.message);
        return;
      }
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

      {/* A failure, or a retry under way: the API clears the reason when the
          agent goes out again, but keeps the retry count and the last failure time. */}
      {delivery.collection ? <CollectionResult delivery={delivery} /> : null}

      {delivery.status === "failed" || (delivery.retry_count ?? 0) > 0 ? (
        <Card
          padding="md"
          className="flex flex-col gap-1 text-sm"
          data-testid="delivery-failure"
          data-state={delivery.status === "failed" ? "failed" : "retrying"}
        >
          <h3 className="font-bold text-text">
            {delivery.status === "failed" ? t("failure.title") : t("failure.retryTitle")}
          </h3>
          {delivery.failure_reason ? (
            <p className="text-text" data-testid="delivery-failure-text">
              {delivery.failure_reason}
            </p>
          ) : null}
          {delivery.failed_at ? (
            <p className="text-text-muted">
              {delivery.status === "failed"
                ? t("failure.at", { at: dateTime(delivery.failed_at) })
                : t("failure.lastAt", { at: dateTime(delivery.failed_at) })}
            </p>
          ) : null}
          <p className="text-text-muted" data-testid="delivery-retry-count">
            {t("failure.retries", { count: delivery.retry_count ?? 0 })}
          </p>
          {delivery.status === "failed" ? (
            <p className="text-text-muted">{t("failure.next")}</p>
          ) : null}
        </Card>
      ) : null}

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
            {confirming === "failed" ? (
              <label className="flex flex-col gap-1 text-sm font-semibold text-text">
                {t("failureReason")}
                <textarea
                  value={failureReason}
                  onChange={(event) => setFailureReason(event.target.value)}
                  required
                  maxLength={500}
                  rows={3}
                  className="rounded-md border border-border bg-card px-3 py-2 font-normal"
                  placeholder={t("failureReasonPlaceholder")}
                  data-testid="delivery-failure-reason"
                />
              </label>
            ) : null}
            {confirming === "delivered" ? (
              <CollectionStep
                currency={delivery.currency ?? currency}
                choice={choice}
                onChoice={(next) => {
                  setChoice(next);
                  setAmountError(null);
                }}
                amount={amountText}
                onAmount={(next) => {
                  setAmountText(next);
                  setAmountError(null);
                }}
                error={amountError}
                disabled={saving}
              />
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={confirming === "failed" ? "secondary" : "primary"}
                disabled={
                  saving ||
                  (confirming === "failed" && !failureReason.trim()) ||
                  (confirming === "delivered" && choice === "confirmed" && !amountText.trim())
                }
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
                onClick={() => {
                  setConfirming(null);
                  setFailureReason("");
                  setAmountError(null);
                }}
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
                  setFailureReason("");
                  setConfirming(action);
                }}
                data-testid={`delivery-action-${action}`}
              >
                {/* Out for delivery again after a failure is a retry on the same custody. */}
                {delivery.status === "failed" && action === "out_for_delivery"
                  ? t("action.retry")
                  : t(`action.${action}`)}
              </Button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * What was collected. The amount due is not sent to the agent before the
 * delivery (the API has no field for it yet), so the agent types what the
 * customer paid; the server checks it against the order and answers with the
 * result, shown on the page once delivered.
 */
function CollectionStep({
  currency,
  choice,
  onChoice,
  amount,
  onAmount,
  error,
  disabled,
}: {
  currency: string;
  choice: CollectionChoice;
  onChoice: (choice: CollectionChoice) => void;
  amount: string;
  onAmount: (amount: string) => void;
  error: string | null;
  disabled: boolean;
}) {
  const t = useTranslations("deliveries.collection");
  return (
    <fieldset
      className="flex flex-col gap-3 text-sm"
      data-testid="delivery-collection-step"
      disabled={disabled}
    >
      <legend className="mb-1 font-semibold text-text">{t("title")}</legend>
      <label className="flex items-start gap-2">
        <input
          type="radio"
          name="collection"
          className="mt-1"
          checked={choice === "confirmed"}
          onChange={() => onChoice("confirmed")}
          data-testid="delivery-collection-confirmed"
        />
        <span className="flex flex-1 flex-col gap-2">
          <span className="text-text">{t("collected")}</span>
          {choice === "confirmed" ? (
            <span className="flex items-center gap-2">
              <input
                value={amount}
                onChange={(event) => onAmount(event.target.value)}
                inputMode="decimal"
                autoComplete="off"
                dir="ltr"
                aria-label={t("amount")}
                aria-invalid={error ? true : undefined}
                className="h-11 w-40 rounded-md border border-border bg-card px-3 text-end font-semibold"
                data-testid="delivery-collected-amount"
              />
              <span className="text-text-muted">{currency}</span>
            </span>
          ) : null}
        </span>
      </label>
      <label className="flex items-start gap-2">
        <input
          type="radio"
          name="collection"
          className="mt-1"
          checked={choice === "unconfirmed"}
          onChange={() => onChoice("unconfirmed")}
          data-testid="delivery-collection-unconfirmed"
        />
        <span className="flex flex-col">
          <span className="text-text">{t("notConfirmed")}</span>
          <span className="text-xs text-text-muted">{t("notConfirmedHint")}</span>
        </span>
      </label>
      <p className="text-xs text-text-muted">{t("checkedNote")}</p>
      {error ? (
        <p
          className="rounded-md bg-error/10 p-2 text-error-dark"
          role="alert"
          data-testid="delivery-collection-error"
        >
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** The collection the server recorded: in full, short (and by how much), or not yet confirmed. */
function CollectionResult({ delivery }: { delivery: Delivery }) {
  const t = useTranslations("deliveries.collection");
  const locale = useLocale() as Locale;
  const collection = delivery.collection!;
  const money = (value: number | null | undefined) =>
    formatPrice(Number(value ?? 0), collection.currency, locale);
  const short = collection.status === "confirmed_short";
  return (
    <Card
      padding="md"
      className={
        short
          ? "flex flex-col gap-1 border-warning text-sm"
          : "flex flex-col gap-1 text-sm"
      }
      data-testid="delivery-collection"
      data-status={collection.status}
    >
      <h3 className="font-bold text-text">{t(`result.${collection.status}`)}</h3>
      <dl className="grid gap-2 sm:grid-cols-3">
        <div>
          <dt className="text-text-muted">{t("due")}</dt>
          <dd className="font-semibold text-text" dir="ltr" data-testid="delivery-collection-due">
            {money(collection.due_amount)}
          </dd>
        </div>
        {collection.collected_amount !== null ? (
          <div>
            <dt className="text-text-muted">{t("collectedAmount")}</dt>
            <dd
              className="font-semibold text-text"
              dir="ltr"
              data-testid="delivery-collection-collected"
            >
              {money(collection.collected_amount)}
            </dd>
          </div>
        ) : null}
        {short ? (
          <div>
            <dt className="text-text-muted">{t("shortfall")}</dt>
            <dd
              className="font-bold text-error-dark"
              dir="ltr"
              data-testid="delivery-collection-shortfall"
            >
              {money(collection.shortfall_amount)}
            </dd>
          </div>
        ) : null}
      </dl>
      {collection.status === "unconfirmed" ? (
        <p className="text-text-muted">{t("unconfirmedNext")}</p>
      ) : null}
    </Card>
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
