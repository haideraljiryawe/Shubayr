"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { OtpForm } from "@/components/auth/otp-form";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { STORE_INFO } from "@/config/store-info";
import { Link } from "@/i18n/navigation";
import {
  ACCOUNT_DELETION_BLOCKED,
  ACCOUNT_DELETION_REASONS,
  ApiError,
  api,
  type AccountDeletionReason,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Refusal {
  reason: AccountDeletionReason | "other";
  /** How many orders/returns, read from the API's message ("2 open order(s) remain"). */
  count: number;
}

/** The 409's field errors, one per reason; unknown codes still say something. */
function refusalsOf(error: ApiError): Refusal[] {
  const refusals = error.errors.map((entry) => ({
    reason: (ACCOUNT_DELETION_REASONS as readonly string[]).includes(entry.code)
      ? (entry.code as AccountDeletionReason)
      : ("other" as const),
    count: Number(/^\s*(\d+)/.exec(entry.message ?? "")?.[1] ?? 0),
  }));
  return refusals.length ? refusals : [{ reason: "other", count: 0 }];
}

/**
 * The account deletion flow on /account/delete (DELETE /me/account).
 *
 * Signed out: sign in right here with the phone code — /login is behind the
 * gate while the store is "opening soon", this page is not. Signed in: tick,
 * confirm, and either the account is deleted (then signed out) or the API's
 * reasons for refusing are listed, each with where to finish it.
 */
export function DeleteAccount() {
  const t = useTranslations("deleteAccount");
  const { ready, isAuthenticated, user, logout } = useAuth();
  const [understood, setUnderstood] = useState(false);
  const [pending, setPending] = useState(false);
  const [refusals, setRefusals] = useState<Refusal[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);

  async function remove() {
    setPending(true);
    setRefusals(null);
    setFailed(false);
    try {
      await api.deleteAccount();
      setDone(true);
      // The API already revoked every session; this clears the local one.
      logout();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.code === ACCOUNT_DELETION_BLOCKED) {
        setRefusals(refusalsOf(error));
      } else {
        setFailed(true);
      }
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <Card padding="lg" className="flex flex-col items-center gap-3 text-center" data-testid="delete-done" role="status">
        <CheckCircle2 className="size-10 text-primary-dark" aria-hidden />
        <h2 className="text-lg font-bold text-text">{t("doneTitle")}</h2>
        <p className="text-sm text-text-muted">{t("doneBody")}</p>
        <Link href="/" className={buttonClasses({ variant: "secondary", className: "mt-2" })}>
          {t("home")}
        </Link>
      </Card>
    );
  }

  if (!ready) {
    return (
      <Card padding="lg" className="flex justify-center">
        <Loader2 className="size-6 animate-spin text-text-muted" aria-hidden />
      </Card>
    );
  }

  if (!isAuthenticated) {
    return (
      <Card padding="lg" className="flex flex-col gap-4" data-testid="delete-signed-out">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-text">{t("signedOutTitle")}</h2>
          <p className="text-sm text-text-muted">{t("signedOutBody")}</p>
        </div>
        {/* Signing in keeps the visitor here: the confirm step replaces the form. */}
        <OtpForm onSignedIn={() => undefined} />
        <p className="text-xs text-text-muted" data-testid="delete-support">
          {t.rich("noAccess", {
            phone: () => (
              <a href={`tel:${STORE_INFO.phone}`} dir="ltr" className="font-medium text-primary-dark [unicode-bidi:isolate]">
                {STORE_INFO.phone}
              </a>
            ),
            email: () => (
              <a href={`mailto:${STORE_INFO.email}`} dir="ltr" className="font-medium text-primary-dark [unicode-bidi:isolate]">
                {STORE_INFO.email}
              </a>
            ),
          })}
        </p>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="flex flex-col gap-4" data-testid="delete-confirm">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-text">
          {t.rich("confirmTitle", {
            phone: () => (
              <span dir="ltr" className="[unicode-bidi:isolate]">
                {user?.phone ?? ""}
              </span>
            ),
          })}
        </h2>
        <p className="text-sm text-text-muted">{t("confirmBody")}</p>
      </div>

      {refusals ? (
        <div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-4" role="alert" data-testid="delete-blocked">
          <p className="flex items-center gap-2 text-sm font-bold text-text">
            <AlertTriangle className="size-4.5 shrink-0 text-warning-dark" aria-hidden />
            {t("blockedTitle")}
          </p>
          <p className="text-sm text-text-muted">{t("blockedBody")}</p>
          <ul className="flex list-disc flex-col gap-2 ps-5 text-sm text-text">
            {refusals.map((refusal) => (
              <li key={refusal.reason} data-testid={`delete-reason-${refusal.reason}`}>
                {t(`reasons.${refusal.reason}`, { count: refusal.count })}{" "}
                {refusal.reason === "OPEN_ORDERS" ? (
                  <Link href="/account/orders" className="font-semibold text-primary-dark underline-offset-4 hover:underline">
                    {t("myOrders")}
                  </Link>
                ) : refusal.reason === "PENDING_RETURNS" ? (
                  <Link href="/account/returns" className="font-semibold text-primary-dark underline-offset-4 hover:underline">
                    {t("myReturns")}
                  </Link>
                ) : refusal.reason === "UNSETTLED_AMOUNTS" ? (
                  <Link href="/support" className="font-semibold text-primary-dark underline-offset-4 hover:underline">
                    {t("contact")}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {failed ? (
        <p className="text-sm font-medium text-error-dark" role="alert" data-testid="delete-failed">
          {t("failed")}
        </p>
      ) : null}

      <Checkbox
        label={t("confirmCheck")}
        checked={understood}
        onChange={(event) => setUnderstood(event.target.checked)}
        data-testid="delete-understood"
      />
      <Button
        type="button"
        variant="primary"
        className="self-start bg-error-dark hover:bg-error-dark hover:opacity-95 active:bg-error-dark"
        disabled={!understood || pending}
        onClick={() => void remove()}
        startIcon={pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
        data-testid="delete-submit"
      >
        {pending ? t("deleting") : t("confirm")}
      </Button>
    </Card>
  );
}
