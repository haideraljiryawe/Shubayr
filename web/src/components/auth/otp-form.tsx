"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Loader2, MessageSquareText, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, fieldErrorId } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/* ---------------------------------------------------------------------------
 * Phone + OTP sign-in, in two steps.
 *
 * Used by the login page and by the checkout's sign-in step, which seeds the
 * number the guest already typed into their delivery address.
 * ------------------------------------------------------------------------- */

/** Iraqi mobile numbers: 11 digits beginning 07. */
const PHONE_PATTERN = /^07\d{9}$/;
const CODE_LENGTH = 6;

/** Seconds before «إعادة إرسال الرمز» becomes available again. */
export const RESEND_COOLDOWN_SECONDS = 30;

function normalise(phone: string): string {
  return phone.replace(/[\s-]/g, "");
}

export function OtpForm({
  defaultPhone = "",
  onSignedIn,
  onCancel,
  cancelLabel,
}: {
  defaultPhone?: string;
  onSignedIn: (user: User) => void;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const t = useTranslations("auth");
  const { requestOtp, verifyOtp } = useAuth();
  const ids = useId();

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState(defaultPhone);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const codeInput = useRef<HTMLInputElement>(null);

  const phoneId = `${ids}-phone`;
  const codeId = `${ids}-code`;

  // One interval for the resend timer, cleared when it reaches zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const send = useCallback(
    async (target: string) => {
      setPending(true);
      setError(null);
      try {
        await requestOtp(target);
        setStep("code");
        setCooldown(RESEND_COOLDOWN_SECONDS);
        return true;
      } catch (cause) {
        setError(
          cause instanceof ApiError && cause.status === 429
            ? t("errTooMany")
            : t("errSendFailed"),
        );
        return false;
      } finally {
        setPending(false);
      }
    },
    [requestOtp, t],
  );

  // Focus the code box when it appears, so the flow needs no extra tab.
  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
  }, [step]);

  async function handlePhoneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!PHONE_PATTERN.test(normalise(phone))) {
      setError(t("errPhone"));
      return;
    }
    await send(phone);
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entered = code.trim();
    if (entered.length !== CODE_LENGTH) {
      setError(t("errCodeLength"));
      return;
    }

    setPending(true);
    setError(null);
    try {
      const user = await verifyOtp(normalise(phone), entered);
      onSignedIn(user);
    } catch (cause) {
      // The contract answers 401 for a code that is wrong, used or expired.
      setError(
        cause instanceof ApiError && cause.status === 401
          ? t("errCode")
          : t("errVerifyFailed"),
      );
      setCode("");
      codeInput.current?.focus();
    } finally {
      setPending(false);
    }
  }

  if (step === "phone") {
    return (
      <form onSubmit={handlePhoneSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary/12">
            <Smartphone className="size-6 text-primary-dark" aria-hidden />
          </span>
          <h2 className="text-xl font-bold text-text">{t("phoneTitle")}</h2>
          <p className="text-sm text-text-muted">{t("phoneBody")}</p>
        </div>

        <Field label={t("phone")} htmlFor={phoneId} error={error ?? undefined}>
          <Input
            id={phoneId}
            name="phone"
            type="tel"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            autoFocus
            value={phone}
            invalid={Boolean(error)}
            aria-describedby={error ? fieldErrorId(phoneId) : undefined}
            placeholder={t("phonePlaceholder")}
            data-testid="auth-phone"
            onChange={(event) => {
              setPhone(event.target.value);
              if (error) setError(null);
            }}
          />
        </Field>

        <Button
          type="submit"
          variant="cta"
          size="lg"
          block
          disabled={pending}
          data-testid="auth-send-otp"
          startIcon={
            pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null
          }
        >
          {pending ? t("sending") : t("sendCode")}
        </Button>

        {onCancel ? (
          <Button type="button" variant="ghost" block onClick={onCancel}>
            <ArrowLeft className="size-4 rtl-flip" aria-hidden />
            {cancelLabel ?? t("back")}
          </Button>
        ) : null}
      </form>
    );
  }

  return (
    <form onSubmit={handleCodeSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary/12">
          <MessageSquareText className="size-6 text-primary-dark" aria-hidden />
        </span>
        <h2 className="text-xl font-bold text-text">{t("codeTitle")}</h2>
        <p className="text-sm text-text-muted">
          {t("codeBody")}{" "}
          <span dir="ltr" className="font-semibold text-text [unicode-bidi:isolate]">
            {normalise(phone)}
          </span>
        </p>
      </div>

      <Field label={t("code")} htmlFor={codeId} error={error ?? undefined}>
        <Input
          id={codeId}
          ref={codeInput}
          name="one-time-code"
          dir="ltr"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          value={code}
          invalid={Boolean(error)}
          aria-describedby={error ? fieldErrorId(codeId) : undefined}
          placeholder="——————"
          data-testid="auth-code"
          onChange={(event) => {
            // Digits only: a pasted "123 456" should still submit.
            setCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH));
            if (error) setError(null);
          }}
          className="text-center text-lg font-bold tracking-[0.4em]"
        />
      </Field>

      <Button
        type="submit"
        variant="cta"
        size="lg"
        block
        disabled={pending}
        data-testid="auth-verify"
        startIcon={
          pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null
        }
      >
        {pending ? t("verifying") : t("verify")}
      </Button>

      <div className="flex flex-col items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={cooldown > 0 || pending}
          data-testid="auth-resend"
          onClick={() => {
            setCode("");
            void send(phone);
          }}
        >
          {t("resend")}
        </Button>
        {cooldown > 0 ? (
          <p
            aria-live="polite"
            data-testid="auth-cooldown"
            className="text-xs text-text-muted"
          >
            {t("resendIn", { seconds: cooldown })}
          </p>
        ) : null}
      </div>

      <Button
        type="button"
        variant="ghost"
        block
        onClick={() => {
          setStep("phone");
          setCode("");
          setError(null);
        }}
        data-testid="auth-change-phone"
      >
        <ArrowLeft className="size-4 rtl-flip" aria-hidden />
        {t("changePhone")}
      </Button>
    </form>
  );
}
