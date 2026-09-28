"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Input } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { useApiForm } from "@/components/forms/use-api-form";
import { postJson } from "@/lib/api/client";
import type { components } from "@/types/api";
import { hardNavigate } from "@/lib/hard-navigate";

type User = components["schemas"]["User"];

/**
 * Username + password. The pair the API returns never reaches this code —
 * /api/auth/login writes it into httpOnly cookies and hands back the user.
 */
export function LoginForm({
  next,
  expired,
}: {
  next: string;
  expired: boolean;
}) {
  const t = useTranslations("auth");
  const form = useApiForm();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function submit() {
    const result = await form.run(() =>
      postJson<{ user: User }>("/api/auth/login", {
        username: username.trim().toLowerCase(),
        password,
      }),
    );
    if (!result) return;
    // A full navigation, so the next render starts from the new cookies.
    hardNavigate(result.user.must_change_password ? "/change-password" : next);
  }

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t("signInTitle")}</h1>
        <p className="text-sm text-text-muted">{t("signInBody")}</p>
      </div>

      {expired && !form.formError ? (
        <Alert tone="info">{t("sessionExpired")}</Alert>
      ) : null}

      {/* The lockout gets its own wording: it tells the person to stop
          retrying, which a generic "wrong password" would not. */}
      {form.formError === "locked" ? (
        <Alert data-testid="lockout-message">{t("locked")}</Alert>
      ) : form.formError === "unauthorized" ? (
        <Alert data-testid="login-error">{t("invalidCredentials")}</Alert>
      ) : (
        <FormError kind={form.formError} detail={form.formErrorDetail} />
      )}

      <Field
        label={t("username")}
        error={form.fieldErrors.username}
        name="username"
      >
        <Input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          dir="ltr"
          required
          value={username}
          data-testid="login-username"
          onChange={(event) => {
            setUsername(event.target.value);
            form.clearField("username");
          }}
        />
      </Field>
      <Field
        label={t("password")}
        error={form.fieldErrors.password}
        name="password"
      >
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          dir="ltr"
          required
          value={password}
          data-testid="login-password"
          onChange={(event) => {
            setPassword(event.target.value);
            form.clearField("password");
          }}
        />
      </Field>
      <Button type="submit" pending={form.pending} data-testid="login-submit">
        {t("signIn")}
      </Button>
    </form>
  );
}
