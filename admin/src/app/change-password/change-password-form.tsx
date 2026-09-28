"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, Circle } from "lucide-react";
import { Alert, Button, Input } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { useApiForm } from "@/components/forms/use-api-form";
import { postJson } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import {
  PASSWORD_RULES,
  isStrongPassword,
  passwordChecks,
} from "@/lib/password";
import { hardNavigate } from "@/lib/hard-navigate";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const t = useTranslations("password");
  const tAuth = useTranslations("auth");
  const form = useApiForm();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const checks = passwordChecks(next);

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
    if (result !== undefined) hardNavigate("/");
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
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-text-muted">
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
        <FormError kind={form.formError} detail={form.formErrorDetail} />
      )}

      <Field
        label={t("current")}
        error={form.fieldErrors.current_password}
        name="current_password"
      >
        <Input
          type="password"
          autoComplete="current-password"
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
        <Input
          type="password"
          autoComplete="new-password"
          dir="ltr"
          value={next}
          data-testid="new-password"
          onChange={(event) => {
            setNext(event.target.value);
            form.clearField("new_password");
          }}
        />
      </Field>
      <ul
        className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2"
        aria-label={t("rules")}
      >
        {PASSWORD_RULES.map((rule) => (
          <li
            key={rule}
            className={cn(
              "flex items-center gap-1.5",
              checks[rule] ? "text-success-dark" : "text-text-muted",
            )}
          >
            {checks[rule] ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <Circle className="size-3.5" aria-hidden />
            )}
            {t(`rule.${rule}`)}
          </li>
        ))}
      </ul>
      <Field
        label={t("confirm")}
        error={form.fieldErrors.confirm}
        name="confirm"
      >
        <Input
          type="password"
          autoComplete="new-password"
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
          className="cursor-pointer text-center text-sm font-semibold text-text-muted hover:underline"
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
          href="/"
          className="text-center text-sm font-semibold text-primary-dark hover:underline"
        >
          {tAuth("backToAdmin")}
        </Link>
      )}
    </form>
  );
}
