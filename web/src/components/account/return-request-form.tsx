"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Link, useRouter } from "@/i18n/navigation";
import { api, type Order, type OrderItem } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { OrderItemLine } from "./order-item-line";
import { AccountError, AccountSkeleton } from "./states";

type Selection = { checked: boolean; quantity: number };

/**
 * Request a return against a delivered order.
 *
 * Partial returns are the normal case, so every line carries its own checkbox
 * and quantity stepper capped at what was actually bought. The guard below is
 * the real one: a return may only be raised against a delivered order, and the
 * page refuses anything else rather than letting the request 422 server-side.
 */
export function ReturnRequestForm({ orderId }: { orderId: string }) {
  const t = useTranslations("returns");
  const tOrders = useTranslations("orders");
  const router = useRouter();
  const showToast = useToast();

  const {
    data: order,
    failed,
    reload,
  } = useResource<Order | { notFound: true }>(
    () =>
      api.getOrder(orderId).catch((cause: unknown) => {
        const status = (cause as { status?: number } | null)?.status;
        if (status === 404) return { notFound: true } as const;
        throw cause;
      }),
    [orderId],
  );

  const [selection, setSelection] = useState<Record<string, Selection>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const items = useMemo(
    () => (order && !("notFound" in order) ? (order.items ?? []) : []),
    [order],
  );

  const setLine = useCallback((id: string, patch: Partial<Selection>) => {
    setSelection((current) => {
      const existing = current[id] ?? { checked: false, quantity: 1 };
      return { ...current, [id]: { ...existing, ...patch } };
    });
    setError(undefined);
  }, []);

  if (failed) return <AccountError onRetry={reload} />;
  if (!order) return <AccountSkeleton rows={4} />;

  if ("notFound" in order) {
    return <NotAllowed message={tOrders("notFound")} orderId={orderId} />;
  }
  // The guard: returns belong to delivered orders only.
  if (order.status !== "delivered") {
    return <NotAllowed message={t("notDelivered")} orderId={orderId} />;
  }

  const chosen = items
    .map((item) => {
      const line = selection[item.id ?? ""];
      return line?.checked
        ? { order_item_id: item.id ?? "", quantity: line.quantity }
        : null;
    })
    .filter((line): line is { order_item_id: string; quantity: number } =>
      Boolean(line),
    );

  const submit = async () => {
    if (chosen.length === 0) {
      setError(t("errNoItems"));
      return;
    }

    setSaving(true);
    setError(undefined);
    try {
      await api.createReturn({
        order_id: order.id ?? orderId,
        reason: reason.trim() || undefined,
        items: chosen,
      });
      showToast(t("submitted"));
      router.push("/account/returns");
    } catch {
      setError(t("errFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      noValidate
      data-testid="return-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
    >
      <Card padding="md" className="flex flex-col gap-1">
        <p className="text-sm text-text-muted">{t("requestIntro")}</p>
        <p className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">{t("forOrder")}</span>
          <span dir="ltr" className="font-bold text-text [unicode-bidi:isolate]">
            {order.order_number}
          </span>
        </p>
      </Card>

      <Card padding="md" className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-text">{t("selectItems")}</h2>

        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => (
            <ReturnLine
              key={item.id}
              item={item}
              selection={selection[item.id ?? ""]}
              onChange={(patch) => setLine(item.id ?? "", patch)}
            />
          ))}
        </ul>

        {error ? (
          <p
            role="alert"
            data-testid="return-error"
            className="text-sm font-medium text-error"
          >
            {error}
          </p>
        ) : null}
      </Card>

      <Card padding="md">
        <Field label={t("reason")} htmlFor="return-reason" hint={t("reasonHint")}>
          <Textarea
            id="return-reason"
            name="reason"
            data-testid="return-reason"
            rows={3}
            value={reason}
            placeholder={t("reasonPlaceholder")}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button
          type="submit"
          variant="cta"
          block
          disabled={saving}
          data-testid="return-submit"
          startIcon={
            saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="size-4" aria-hidden />
            )
          }
        >
          {saving ? t("submitting") : t("submit")}
        </Button>
        <Link
          href={`/account/orders/${orderId}`}
          className={buttonClasses({ variant: "ghost", block: true })}
        >
          <ArrowLeft className="size-4 rtl-flip" aria-hidden />
          {t("backToOrder")}
        </Link>
      </div>
    </form>
  );
}

function ReturnLine({
  item,
  selection,
  onChange,
}: {
  item: OrderItem;
  selection?: Selection;
  onChange: (patch: Partial<Selection>) => void;
}) {
  const t = useTranslations("returns");
  const id = item.id ?? "";
  const max = item.quantity ?? 1;
  const checked = selection?.checked ?? false;
  const quantity = Math.min(selection?.quantity ?? 1, max);

  return (
    <li className="py-3">
      <OrderItemLine item={item}>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Checkbox
            id={`return-item-${id}`}
            data-testid={`return-check-${id}`}
            checked={checked}
            onChange={(event) => onChange({ checked: event.target.checked })}
            label={t("request")}
          />

          {/* ×N of what was bought: Latin digits, isolated from the RTL run. */}
          <span dir="ltr" className="text-xs text-text-muted [unicode-bidi:isolate]">
            ×{max}
          </span>
        </span>

        {checked ? (
          <span className="mt-1 flex items-center gap-2">
            <span id={`return-qty-label-${id}`} className="text-xs text-text-muted">
              {t("quantity")}
            </span>
            <span
              role="group"
              aria-labelledby={`return-qty-label-${id}`}
              data-testid={`return-qty-${id}`}
            >
              <QuantityStepper
                value={quantity}
                min={1}
                max={max}
                onValueChange={(next) => onChange({ quantity: next })}
              />
            </span>
          </span>
        ) : null}
      </OrderItemLine>
    </li>
  );
}

function NotAllowed({
  message,
  orderId,
}: {
  message: string;
  orderId: string;
}) {
  const t = useTranslations("returns");

  return (
    <Card padding="lg" className="text-center" role="alert">
      <RotateCcw className="mx-auto size-10 text-text-muted" aria-hidden />
      <p className="mt-3 font-medium text-text" data-testid="return-blocked">
        {message}
      </p>
      <Link
        href={`/account/orders/${orderId}`}
        className={buttonClasses({ variant: "secondary", className: "mt-5" })}
      >
        {t("backToOrder")}
      </Link>
    </Card>
  );
}
