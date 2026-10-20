"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
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
 *
 * Switching the language re-renders the page under the other locale, which
 * mounts this form afresh. So that a shopper who switches half-way keeps
 * their place (NOTE-012), the step, the number and the resend timer are kept
 * for the tab in sessionStorage under `progressKey` — never the code itself
 * — and errors are held as message keys, so they are worded in the new
 * language rather than left in the old one.
 * ------------------------------------------------------------------------- */

/** Iraqi mobile numbers: 11 digits beginning 07. */
const PHONE_PATTERN = /^07\d{9}$/;
const CODE_LENGTH = 6;

/** Seconds before «إعادة إرسال الرمز» becomes available again. */
export const RESEND_COOLDOWN_SECONDS = 30;

type Step = "phone" | "code";
type ErrorKey = "errPhone" | "errTooMany" | "errSendFailed" | "errCodeLength" | "errCode" | "errVerifyFailed";

interface Progress {
  step: Step;
  phone: string;
  /** When resending becomes possible again (epoch ms). */
  resendAt: number;
}

const STORAGE_PREFIX = "shubayr.otp.";

function normalise(phone: string): string {
  return phone.replace(/[\s-]/g, "");
}

function readProgress(key: string | undefined): Progress | null {
  if (!key) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Progress>;
    if ((value.step !== "phone" && value.step !== "code") || typeof value.phone !== "string") return null;
    return { step: value.step, phone: value.phone, resendAt: Number(value.resendAt) || 0 };
  } catch {
    return null;
  }
}

function writeProgress(key: string | undefined, progress: Progress | null) {
  if (!key) return;
  try {
    if (progress) window.sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(progress));
    else window.sessionStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // Storage blocked (private mode): the form still works, it just won't
    // survive a language switch.
  }
}

const noSubscription = () => () => {};

interface OtpFormProps {
  defaultPhone?: string;
  onSignedIn: (user: User) => void;
  onCancel?: () => void;
  cancelLabel?: string;
  /** Keep this form's progress across a language switch, under this name. */
  progressKey?: string;
}

export function OtpForm(props: OtpFormProps) {
  // sessionStorage exists only in the browser: the server render (and the
  // hydration pass) start fresh, and the form re-mounts once with what the
  // tab kept. A client-side mount — a language switch — reads it at once.
  const inBrowser = useSyncExternalStore(noSubscription, () => true, () => false);
  return <OtpSteps key={inBrowser ? "browser" : "server"} {...props} restore={inBrowser} />;
}

function OtpSteps({
  defaultPhone = "",
  onSignedIn,
  onCancel,
  cancelLabel,
  progressKey,
  restore,
}: OtpFormProps & { restore: boolean }) {
  const t = useTranslations("auth");
  const { requestOtp, verifyOtp } = useAuth();
  const ids = useId();

  const [initial] = useState(() => {
    const kept = restore ? readProgress(progressKey) : null;
    return {
      step: kept?.step ?? "phone",
      phone: kept?.phone ?? defaultPhone,
      cooldown: kept ? Math.max(0, Math.ceil((kept.resendAt - Date.now()) / 1000)) : 0,
      resendAt: kept?.resendAt ?? 0,
    };
  });
  const [step, setStep] = useState<Step>(initial.step);
  const [phone, setPhone] = useState(initial.phone);
  const [code, setCode] = useState("");
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(initial.cooldown);
  const resendAt = useRef(initial.resendAt);

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

  // Keep the step and number for the tab (see the note at the top).
  useEffect(() => {
    if (!restore) return;
    if (step === "phone" && phone === defaultPhone) writeProgress(progressKey, null);
    else writeProgress(progressKey, { step, phone, resendAt: resendAt.current });
  }, [restore, progressKey, step, phone, defaultPhone]);

  const send = useCallback(
    async (target: string) => {
      setPending(true);
      setError(null);
      try {
        await requestOtp(target);
        resendAt.current = Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
        setStep("code");
        setCooldown(RESEND_COOLDOWN_SECONDS);
        writeProgress(progressKey, { step: "code", phone: target, resendAt: resendAt.current });
        return true;
      } catch (cause) {
        setError(cause instanceof ApiError && cause.status === 429 ? "errTooMany" : "errSendFailed");
        return false;
      } finally {
        setPending(false);
      }
    },
    [requestOtp, progressKey],
  );

  // Focus the code box when it appears, so the flow needs no extra tab.
  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
  }, [step]);

  async function handlePhoneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!PHONE_PATTERN.test(normalise(phone))) {
      setError("errPhone");
      return;
    }
    await send(phone);
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entered = code.trim();
    if (entered.length !== CODE_LENGTH) {
      setError("errCodeLength");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const user = await verifyOtp(normalise(phone), entered);
      writeProgress(progressKey, null);
      onSignedIn(user);
    } catch (cause) {
      // The contract answers 401 for a code that is wrong, used or expired.
      setError(cause instanceof ApiError && cause.status === 401 ? "errCode" : "errVerifyFailed");
      setCode("");
      codeInput.current?.focus();
    } finally {
      setPending(false);
    }
  }

  const message = error ? t(error) : undefined;

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

        <Field label={t("phone")} htmlFor={phoneId} error={message}>
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
          <span dir="ltr" className="font-semibold text-text [unicode-bidi:isolate]" data-testid="auth-code-phone">
            {normalise(phone)}
          </span>
        </p>
      </div>

      <Field label={t("code")} htmlFor={codeId} error={message}>
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
