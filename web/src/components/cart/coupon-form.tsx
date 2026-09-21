"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Loader2, TicketPercent, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, fieldErrorId } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";

/**
 * «لديك كوبون خصم؟» — sends a code through POST /coupons/validate.
 *
 * Signed in, that endpoint *attaches* the coupon to the server cart and the
 * discount comes back on the next cart read, so this form never works out what
 * a code is worth — it hands the code to the store and shows what returns.
 *
 * The contract answers 404 for a code that is unknown, used up or expired, so
 * all of those read as one message; anything else (offline, 500) is reported as
 * a failure to check rather than as a bad code, because the code may be fine.
 */
export function CouponForm({
  couponCode,
  onApply,
  onRemove,
}: {
  couponCode: string | null;
  onApply: (code: string) => Promise<void>;
  /** Detaching is a round trip when the server owns the cart, so it awaits. */
  onRemove: () => Promise<void> | void;
}) {
  const t = useTranslations("cart");
  const inputId = useId();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [removing, setRemoving] = useState(false);

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
      await onApply(trimmed);
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

  if (couponCode) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/8 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-medium text-primary-dark">
          <TicketPercent className="size-4 shrink-0" aria-hidden />
          {t("couponApplied", { code: couponCode })}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={removing}
          data-testid="coupon-remove"
          startIcon={
            removing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <X className="size-4" aria-hidden />
            )
          }
          onClick={async () => {
            setRemoving(true);
            setError(null);
            try {
              await onRemove();
            } catch {
              setError(t("couponRemoveFailed"));
            } finally {
              setRemoving(false);
            }
          }}
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
