"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Link, useRouter } from "@/i18n/navigation";
import {
  ApiError,
  api,
  type Order,
  type OrderItem,
  type Return,
} from "@/lib/api";
import {
  RETURN_REASON_CODES,
  mayRefundDeliveryFee,
  returnLineProblem,
  type ReturnReasonCode,
} from "@/lib/return-reasons";
import { useResource } from "@/lib/use-resource";
import { OrderItemLine } from "./order-item-line";
import { AccountError, AccountSkeleton } from "./states";

type Selection = {
  checked: boolean;
  quantity: number;
  /** One of the API's reasons; "" until the shopper picks one. */
  reasonCode: ReturnReasonCode | "";
  reason: string;
  /** A weighed or measured line's quantity as typed ("0.25"). */
  text?: string;
};

/**
 * Quantities are exact to the thousandth (multipleOf 0.001 in the contract)
 * and compared as integer thousandths, so 1.5 − 0.25 is never 1.2500000001
 * and nothing the server would refuse for its precision is ever sent.
 */
const toMilli = (value: number) => Math.round(value * 1000);
const fromMilli = (milli: number) => milli / 1000;

/** A typed weighed quantity: up to three decimals, more than 0, at most `max`. */
export function parseWeighedQuantity(
  text: string,
  max: number,
):
  | { ok: true; value: number }
  | { ok: false; problem: "invalid" | "precision" | "exceeds" } {
  const cleaned = text
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, ".")
    .trim();
  if (!/^\d+(?:\.\d+)?$|^\.\d+$/.test(cleaned)) {
    return { ok: false, problem: "invalid" };
  }
  const decimals = cleaned.includes(".")
    ? cleaned.split(".")[1].replace(/0+$/, "").length
    : 0;
  if (decimals > 3) return { ok: false, problem: "precision" };
  const milli = toMilli(Number(cleaned));
  if (milli <= 0) return { ok: false, problem: "invalid" };
  if (milli > toMilli(max)) return { ok: false, problem: "exceeds" };
  return { ok: true, value: fromMilli(milli) };
}

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
  // One operation id per distinct request: a retry of the same request (a
  // timeout, a double tap) reuses it and the server answers it once; a
  // corrected request after a refusal gets a new one — the server refuses an
  // old id that comes back with a different payload.
  const operation = useRef<{ signature: string; id: string } | null>(null);

  const items = useMemo(
    () => (order && !("notFound" in order) ? (order.items ?? []) : []),
    [order],
  );

  const setLine = useCallback((id: string, patch: Partial<Selection>) => {
    setSelection((current) => {
      const existing = current[id] ?? {
        checked: false,
        quantity: 1,
        reasonCode: "",
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
      return fromMilli(
        Math.max(
          0,
          toMilli(item.quantity ?? 0) -
            toMilli(reserved.get(item.id ?? "") ?? 0),
        ),
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
      if (!line?.checked) return null;
      const cap = eligible(item);
      // A weighed line is what was typed (0 when it isn't a valid quantity,
      // which submit refuses); pieces never exceed what is still returnable,
      // whatever the stepper last held.
      const weighed =
        item.whole_units_only === false
          ? parseWeighedQuantity(line.text ?? String(cap), cap)
          : null;
      const quantity = weighed
        ? weighed.ok
          ? weighed.value
          : 0
        : Math.min(Math.round(line.quantity), Math.floor(cap));
      return {
        order_item_id: item.id ?? "",
        quantity,
        reason_code: line.reasonCode,
        // Per LINE, which is what the contract requires: one line may be
        // damaged while another is simply the wrong size.
        reason: line.reason.trim(),
      };
    })
    .filter(
      (
        line,
      ): line is {
        order_item_id: string;
        quantity: number;
        reason: string;
        reason_code: ReturnReasonCode | "";
      } => Boolean(line),
    );

  const submit = async () => {
    if (chosen.length === 0) {
      setError(t("errNoItems"));
      return;
    }
    // The contract makes a reason and a note mandatory on every line, so a
    // missing one is caught here rather than spent on a 422.
    const problems = chosen.map((line) => returnLineProblem({ reasonCode: line.reason_code, note: line.reason }));
    if (problems.includes("reasonCode")) {
      setError(t("errNoReasonCode"));
      return;
    }
    if (problems.includes("note")) {
      setError(t("errNoLineReason"));
      return;
    }
    if (chosen.some((line) => line.quantity <= 0)) {
      setError(t("errQuantity"));
      return;
    }
    const payload = {
      order_id: order.id ?? orderId,
      reason: reason.trim() || undefined,
      items: chosen.map((line) => ({ ...line, reason_code: line.reason_code as ReturnReasonCode })),
    };
    const signature = JSON.stringify(payload);
    if (operation.current?.signature !== signature) {
      operation.current = { signature, id: crypto.randomUUID() };
    }
    const operationId = operation.current.id;

    setSaving(true);
    setError(undefined);
    try {
      await api.createReturn({ ...payload, operation_id: operationId });
      showToast(t("submitted"));
      router.push("/account/returns");
    } catch (cause) {
      // The server is the authority on eligibility and says why in plain
      // terms; relaying that beats "something went wrong" when the answer is
      // "you already returned that one".
      setError(
        cause instanceof ApiError &&
          (cause.status === 422 || cause.status === 409)
          ? cause.message || t("errFailed")
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
          <span
            dir="ltr"
            className="font-bold text-text [unicode-bidi:isolate]"
          >
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

        {/* No amounts: the delivery-fee outcome is the server's, decided at review. */}
        <p
          data-testid="return-fee-hint"
          data-highlight={mayRefundDeliveryFee(chosen.map((line) => line.reason_code)) || undefined}
          className={
            mayRefundDeliveryFee(chosen.map((line) => line.reason_code))
              ? "rounded-md bg-primary/10 px-3 py-2 text-xs text-text"
              : "text-xs text-text-muted"
          }
        >
          {t("feeHint")}
        </p>

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
  const weighed = item.whole_units_only === false;
  const unit = item.base_unit ?? "";
  const checked = selection?.checked ?? false;
  // Pieces step in whole units; a weighed line is typed, to three decimals.
  const pieces = Math.max(1, Math.floor(eligible));
  const quantity = Math.min(selection?.quantity ?? 1, pieces);
  const typed = selection?.text ?? String(eligible);
  const typedCheck = weighed ? parseWeighedQuantity(typed, eligible) : null;
  const typedProblem = typedCheck && !typedCheck.ok ? typedCheck.problem : null;
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
          <span
            dir="ltr"
            className="text-xs text-text-muted [unicode-bidi:isolate]"
          >
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
              {weighed ? (
                <span className="flex items-center gap-2">
                  <Input
                    aria-labelledby={`return-qty-label-${id}`}
                    data-testid={`return-qty-input-${id}`}
                    inputMode="decimal"
                    dir="ltr"
                    className="w-28"
                    value={typed}
                    onChange={(event) => onChange({ text: event.target.value })}
                  />
                  <span dir="ltr" className="text-xs text-text-muted">
                    {unit}
                  </span>
                </span>
              ) : (
                <span
                  role="group"
                  aria-labelledby={`return-qty-label-${id}`}
                  data-testid={`return-qty-${id}`}
                >
                  <QuantityStepper
                    value={quantity}
                    min={1}
                    max={pieces}
                    step={1}
                    onValueChange={(next) => onChange({ quantity: next })}
                  />
                </span>
              )}
            </span>
            {weighed ? (
              <span
                data-testid={`return-qty-hint-${id}`}
                className={
                  typedProblem
                    ? "text-xs font-medium text-error"
                    : "text-xs text-text-muted"
                }
              >
                {typedProblem
                  ? t(`qty_${typedProblem}`, { max: eligible, unit })
                  : t("weighedHint", { max: eligible, unit })}
              </span>
            ) : null}

            {/* Required per line by the contract, and genuinely per line: one
                item can arrive damaged while another is the wrong size. */}
            <Field label={t("reasonCode")} htmlFor={`return-line-code-${id}`}>
              <Select
                id={`return-line-code-${id}`}
                name={`return-line-code-${id}`}
                data-testid={`return-line-code-${id}`}
                value={selection?.reasonCode ?? ""}
                placeholder={t("reasonCodePlaceholder")}
                onChange={(event) => onChange({ reasonCode: event.target.value as ReturnReasonCode })}
              >
                {RETURN_REASON_CODES.map((code) => (
                  <option key={code} value={code}>
                    {t(`reasonCodes.${code}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("lineReason")} htmlFor={`return-line-reason-${id}`}>
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
