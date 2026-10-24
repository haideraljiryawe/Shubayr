"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert, Button } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { PasswordChecklist } from "@/components/forms/password-checklist";
import { PasswordInput } from "@/components/forms/password-input";
import { useApiForm } from "@/components/forms/use-api-form";
import { postJson } from "@/lib/api/client";
import { isStrongPassword } from "@/lib/password";
import { hardNavigate } from "@/lib/hard-navigate";

/**
 * Change one's own password: the shared field primitives, each with
 * show/hide, the policy as a live localized checklist, and afterwards back to
 * the page the person came from (`returnTo`, already made safe by the page).
 */
export function ChangePasswordForm({ forced, returnTo = "/" }: { forced: boolean; returnTo?: string }) {
  const t = useTranslations("password");
  const tAuth = useTranslations("auth");
  const form = useApiForm();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  async function submit() {
    const local: Record<string, string> = {};
    if (!isStrongPassword(next)) local.new_password = t("weak");
    if (confirm !== next) local.confirm = t("mismatch");
    if (next && next === current) local.new_password = t("sameAsCurrent");
    if (Object.keys(local).length > 0) {
      form.setFieldErrors(local);
      return;
    }
    const result = await form.run(() =>
      postJson("/api/auth/change-password", {
        current_password: current,
        new_password: next,
      }),
    );
    if (result !== undefined) hardNavigate(returnTo);
  }

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      data-testid="change-password-form"
      data-forced={forced}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-page-title">{t("title")}</h1>
        <p className="text-body text-text-muted">
          {forced ? t("forcedBody") : t("body")}
        </p>
      </div>
      {forced ? (
        <Alert tone="info" data-testid="forced-password-change">
          {t("forcedNotice")}
        </Alert>
      ) : null}
      {form.formError === "unauthorized" ? (
        <Alert>{t("currentWrong")}</Alert>
      ) : (
        <FormError kind={form.formError} code={form.formErrorCode} />
      )}

      <Field
        label={t("current")}
        error={form.fieldErrors.current_password}
        name="current_password"
      >
        <PasswordInput
          autoComplete="current-password"
          toggleTestId="current-password-toggle"
          dir="ltr"
          value={current}
          data-testid="current-password"
          onChange={(event) => {
            setCurrent(event.target.value);
            form.clearField("current_password");
          }}
        />
      </Field>
      <Field
        label={t("new")}
        error={form.fieldErrors.new_password}
        name="new_password"
      >
        <PasswordInput
          autoComplete="new-password"
          toggleTestId="new-password-toggle"
          dir="ltr"
          value={next}
          data-testid="new-password"
          onChange={(event) => {
            setNext(event.target.value);
            form.clearField("new_password");
          }}
        />
      </Field>
      <PasswordChecklist value={next} />
      <Field
        label={t("confirm")}
        error={form.fieldErrors.confirm}
        name="confirm"
      >
        <PasswordInput
          autoComplete="new-password"
          toggleTestId="confirm-password-toggle"
          dir="ltr"
          value={confirm}
          data-testid="confirm-password"
          onChange={(event) => {
            setConfirm(event.target.value);
            form.clearField("confirm");
          }}
        />
      </Field>
      <Button
        type="submit"
        pending={form.pending}
        data-testid="change-password-submit"
      >
        {t("submit")}
      </Button>
      {forced ? (
        <button
          type="button"
          className="cursor-pointer text-center text-label text-text-muted hover:underline"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" }).catch(
              () => undefined,
            );
            hardNavigate("/login");
          }}
        >
          {tAuth("signOut")}
        </button>
      ) : (
        <Link
          href={returnTo}
          className="text-center text-label text-primary-dark hover:underline"
          data-testid="change-password-back"
        >
          {tAuth("backToAdmin")}
        </Link>
      )}
    </form>
  );
}
