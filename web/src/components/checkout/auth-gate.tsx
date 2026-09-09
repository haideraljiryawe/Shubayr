"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Info, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, fieldErrorId } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/* ---------------------------------------------------------------------------
 * «سجّل الدخول لإتمام الطلب».
 *
 * POST /orders is an authenticated endpoint, so an unauthenticated shopper is
 * routed here before placing the order. This is the placeholder for the real
 * phone-OTP flow: it takes the number and hands it to the session module. The
 * account phase replaces the body of this step with request-otp / verify-otp;
 * the checkout around it — when the gate appears, where it returns to — does
 * not change.
 * ------------------------------------------------------------------------- */

const PHONE_PATTERN = /^07\d{9}$/;

export function AuthGate({
  defaultPhone = "",
  onSignedIn,
  onBack,
}: {
  /** Seeded from the delivery address, so the number is typed once. */
  defaultPhone?: string;
  onSignedIn: (phone: string) => void;
  onBack: () => void;
}) {
  const t = useTranslations("checkout");
  const inputId = useId();
  const [phone, setPhone] = useState(defaultPhone);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = phone.replace(/[\s-]/g, "");
    if (!PHONE_PATTERN.test(trimmed)) {
      setError(t("errPhone"));
      return;
    }
    onSignedIn(trimmed);
  }

  return (
    <Card padding="lg" className="mx-auto flex max-w-lg flex-col gap-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary/12">
          <LogIn className="size-6 text-primary-dark rtl-flip" aria-hidden />
        </span>
        <h2 className="text-xl font-bold text-text">{t("authTitle")}</h2>
        <p className="text-sm text-text-muted">{t("authBody")}</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Field label={t("phone")} htmlFor={inputId} error={error ?? undefined}>
          <Input
            id={inputId}
            name="phone"
            type="tel"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            invalid={Boolean(error)}
            aria-describedby={error ? fieldErrorId(inputId) : undefined}
            placeholder={t("phonePlaceholder")}
            data-testid="auth-phone"
            onChange={(event) => {
              setPhone(event.target.value);
              if (error) setError(null);
            }}
          />
        </Field>

        <p className="flex items-start gap-1.5 text-xs text-text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("authSoon")}
        </p>

        <Button
          type="submit"
          variant="cta"
          size="lg"
          block
          data-testid="auth-submit"
        >
          {t("authSubmit")}
        </Button>

        <Button type="button" variant="ghost" block onClick={onBack}>
          <ArrowLeft className="size-4 rtl-flip" aria-hidden />
          {t("back")}
        </Button>
      </form>
    </Card>
  );
}
