"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError, api, type Order, type OrderItem, type Return } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { OrderItemLine } from "./order-item-line";
import { AccountError, AccountSkeleton } from "./states";

type Selection = { checked: boolean; quantity: number; reason: string };

/**
 * How much of a line is already spoken for by earlier returns.
 *
 * This mirrors the server's own rule exactly: a return still `requested`
 * reserves the quantity asked for, and any other status reserves what was
 * actually approved. It is only a hint — the server re-checks and answers 422
 * — but without it the stepper would happily offer a quantity that cannot be
 * returned, and the shopper would find out only after submitting.
 */
function reservedByOrderItem(returns: Return[]): Map<string, number> {
  const reserved = new Map<string, number>();
  for (const entry of returns) {
    for (const item of entry.items ?? []) {
      const id = item.order_item_id ?? "";
      if (!id) continue;
      const taken =
        entry.status === "requested"
          ? (item.quantity ?? 0)
          : (item.approved_quantity ?? 0);
      reserved.set(id, (reserved.get(id) ?? 0) + taken);
    }
  }
  return reserved;
}

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

  // Earlier returns against this order decide what is still returnable.
  const { data: myReturns } = useResource<Return[]>(
    () => api.listReturns().catch(() => []),
    [],
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
      const existing = current[id] ?? {
        checked: false,
        quantity: 1,
        reason: "",
      };
      return { ...current, [id]: { ...existing, ...patch } };
    });
    setError(undefined);
  }, []);

  const eligible = useCallback(
    (item: OrderItem): number => {
      const reserved = reservedByOrderItem(
        (myReturns ?? []).filter((entry) => entry.order_id === orderId),
      );
      return Math.max(
        0,
        (item.quantity ?? 0) - (reserved.get(item.id ?? "") ?? 0),
      );
    },
    [myReturns, orderId],
  );

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
        ? {
            order_item_id: item.id ?? "",
            quantity: line.quantity,
            // Per LINE, which is what the contract requires: one line may be
            // damaged while another is simply the wrong size.
            reason: line.reason.trim(),
          }
        : null;
    })
    .filter(
      (
        line,
      ): line is {
        order_item_id: string;
        quantity: number;
        reason: string;
      } => Boolean(line),
    );

  const submit = async () => {
    if (chosen.length === 0) {
      setError(t("errNoItems"));
      return;
    }
    // The contract makes the per-line reason mandatory, so an unfilled one is
    // caught here rather than spent on a 422.
    if (chosen.some((line) => !line.reason)) {
      setError(t("errNoLineReason"));
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
    } catch (cause) {
      // The server is the authority on eligibility and says why in plain
      // terms; relaying that beats "something went wrong" when the answer is
      // "you already returned that one".
      setError(
        cause instanceof ApiError && (cause.status === 422 || cause.status === 409)
          ? (cause.message || t("errFailed"))
          : t("errFailed"),
      );
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
              eligible={eligible(item)}
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
        <Field
          label={t("reason")}
          htmlFor="return-reason"
          hint={t("reasonOverallHint")}
        >
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
  eligible,
  selection,
  onChange,
}: {
  item: OrderItem;
  /** What is still returnable after earlier requests reserved their share. */
  eligible: number;
  selection?: Selection;
  onChange: (patch: Partial<Selection>) => void;
}) {
  const t = useTranslations("returns");
  const id = item.id ?? "";
  const bought = item.quantity ?? 1;
  const checked = selection?.checked ?? false;
  const quantity = Math.min(selection?.quantity ?? 1, Math.max(1, eligible));
  const spent = eligible <= 0;

  return (
    <li className="py-3" data-testid={`return-line-${id}`}>
      <OrderItemLine item={item}>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {spent ? (
            // Nothing left to return, so there is no control to offer — only
            // the reason it is missing.
            <span
              data-testid={`return-spent-${id}`}
              className="text-xs font-medium text-text-muted"
            >
              {t("alreadyReturned")}
            </span>
          ) : (
            <Checkbox
              id={`return-item-${id}`}
              data-testid={`return-check-${id}`}
              checked={checked}
              onChange={(event) => onChange({ checked: event.target.checked })}
              label={t("request")}
            />
          )}

          {/* ×N of what was bought: Latin digits, isolated from the RTL run. */}
          <span dir="ltr" className="text-xs text-text-muted [unicode-bidi:isolate]">
            ×{bought}
          </span>

          {!spent && eligible < bought ? (
            <span
              data-testid={`return-eligible-${id}`}
              className="text-xs text-text-muted"
            >
              {t("eligibleQty", { count: eligible })}
            </span>
          ) : null}
        </span>

        {checked && !spent ? (
          <span className="mt-2 flex flex-col gap-2">
            <span className="flex items-center gap-2">
              <span
                id={`return-qty-label-${id}`}
                className="text-xs text-text-muted"
              >
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
                  max={eligible}
                  onValueChange={(next) => onChange({ quantity: next })}
                />
              </span>
            </span>

            {/* Required per line by the contract, and genuinely per line: one
                item can arrive damaged while another is the wrong size. */}
            <Field
              label={t("lineReason")}
              htmlFor={`return-line-reason-${id}`}
            >
              <Input
                id={`return-line-reason-${id}`}
                name={`return-line-reason-${id}`}
                data-testid={`return-line-reason-${id}`}
                value={selection?.reason ?? ""}
                placeholder={t("lineReasonPlaceholder")}
                onChange={(event) => onChange({ reason: event.target.value })}
              />
            </Field>
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
