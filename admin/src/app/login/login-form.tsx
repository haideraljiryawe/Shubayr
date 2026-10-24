"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Input } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { PasswordInput } from "@/components/forms/password-input";
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
  // Kept as keys, worded at render time, so a language switch re-words them.
  const [missing, setMissing] = useState<{ username?: true; password?: true }>({});

  async function submit() {
    // Login checks presence only; length and format rules belong to creating
    // and changing a password, not to signing in (VIS-001).
    const empty = {
      ...(username.trim() ? {} : { username: true as const }),
      ...(password ? {} : { password: true as const }),
    };
    setMissing(empty);
    if (empty.username || empty.password) return;
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

  const rejected = form.failure === "unauthorized" || form.failure === "validation";

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
        <h1 className="text-page-title text-text">{t("signInTitle")}</h1>
        <p className="text-body text-text-muted">{t("signInBody")}</p>
      </div>

      {expired && !form.formError ? (
        <Alert tone="info">{t("sessionExpired")}</Alert>
      ) : null}

      {/* The lockout gets its own wording: it tells the person to stop
          retrying, which a generic "wrong password" would not. A rejected
          pair is said once, without naming which half was wrong — a 422 on
          sign-in is the same answer, since login applies no format rules. An
          unreachable server is told apart from a wrong password. */}
      {form.formError === "locked" ? (
        <Alert data-testid="lockout-message">{t("locked")}</Alert>
      ) : rejected ? (
        <Alert data-testid="login-error">{t("invalidCredentials")}</Alert>
      ) : form.formError === "unavailable" || form.formError === "unknown" ? (
        <Alert data-testid="login-connection-error">{t("connectionFailed")}</Alert>
      ) : (
        <FormError kind={form.formError} code={form.formErrorCode} />
      )}

      <Field
        label={t("username")}
        error={missing.username ? t("usernameRequired") : undefined}
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
            setMissing((current) => ({ ...current, username: undefined }));
          }}
        />
      </Field>
      <Field
        label={t("password")}
        error={missing.password ? t("passwordRequired") : undefined}
        name="password"
      >
        <PasswordInput
          name="password"
          autoComplete="current-password"
          dir="ltr"
          required
          value={password}
          data-testid="login-password"
          toggleTestId="login-password-toggle"
          onChange={(event) => {
            setPassword(event.target.value);
            setMissing((current) => ({ ...current, password: undefined }));
          }}
        />
      </Field>
      <Button type="submit" pending={form.pending} data-testid="login-submit">
        {t("signIn")}
      </Button>
    </form>
  );
}
