"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Loader2, TicketPercent, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, fieldErrorId } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api";
import type { AppliedCoupon } from "@/lib/cart-store";

/**
 * «لديك كوبون خصم؟» — validates a code against POST /coupons/validate and hands
 * the applied coupon up to the cart.
 *
 * The contract answers 404 for a code that is unknown, used up or expired, so
 * all of those read as one message; anything else (offline, 500) is reported as
 * a failure to check rather than as a bad code, because the code may be fine.
 */
export function CouponForm({
  coupon,
  onApply,
  onRemove,
}: {
  coupon: AppliedCoupon | null;
  onApply: (coupon: AppliedCoupon) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("cart");
  const inputId = useId();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError(t("couponRequired"));
      return;
    }

    setPending(true);
    setError(null);
    try {
      const validated = await api.validateCoupon(trimmed);
      // The contract types every Coupon field as optional; a coupon without a
      // type or value cannot price anything, so treat it as a rejection.
      if (
        !validated.code ||
        (validated.type !== "percentage" && validated.type !== "fixed") ||
        typeof validated.value !== "number"
      ) {
        setError(t("couponInvalid"));
        return;
      }
      onApply({
        code: validated.code,
        type: validated.type,
        value: validated.value,
      });
      setCode("");
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 404
          ? t("couponInvalid")
          : t("couponFailed"),
      );
    } finally {
      setPending(false);
    }
  }

  if (coupon) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/8 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-medium text-primary-dark">
          <TicketPercent className="size-4 shrink-0" aria-hidden />
          {t("couponApplied", { code: coupon.code })}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          data-testid="coupon-remove"
          startIcon={<X className="size-4" aria-hidden />}
        >
          {t("couponRemove")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Field label={t("couponTitle")} htmlFor={inputId} error={error ?? undefined}>
        <div className="flex items-start gap-2">
          <Input
            id={inputId}
            name="coupon"
            value={code}
            autoComplete="off"
            spellCheck={false}
            invalid={Boolean(error)}
            aria-describedby={error ? fieldErrorId(inputId) : undefined}
            disabled={pending}
            placeholder={t("couponPlaceholder")}
            aria-label={t("couponLabel")}
            data-testid="coupon-input"
            onChange={(event) => {
              setCode(event.target.value);
              if (error) setError(null);
            }}
            // Codes are Latin even in the Arabic UI, so isolate the field.
            dir="ltr"
            className="flex-1 uppercase"
          />
          <Button
            type="submit"
            variant="secondary"
            size="lg"
            disabled={pending}
            data-testid="coupon-apply"
            startIcon={
              pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null
            }
            className="h-12 shrink-0"
          >
            {pending ? t("couponApplying") : t("couponApply")}
          </Button>
        </div>
      </Field>
    </form>
  );
}
