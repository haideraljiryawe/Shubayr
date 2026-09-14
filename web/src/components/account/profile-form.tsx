"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, fieldErrorId } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";
import { AccountError, AccountSkeleton } from "./states";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * «الملف الشخصي» — the profile the account header shows, editable.
 *
 * The form is seeded from the cached session user so it is usable immediately,
 * then reconciled with GET /me, which is the authority (another device may have
 * changed the name). The phone is read-only: it identifies the account and
 * changing it is a re-verification flow, not a text edit.
 */
export function ProfileForm() {
  const t = useTranslations("account");
  const { user, setUser } = useAuth();
  const showToast = useToast();
  const ids = useId();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const nameId = `${ids}-name`;
  const emailId = `${ids}-email`;

  const { data: me, failed, reload } = useResource(() => api.getMe(), []);

  // Seed the fields from GET /me the first time it lands, and only then. This
  // is the "adjust state when the input changes" pattern rather than an effect:
  // an effect would re-run and overwrite whatever is being typed.
  const [seeded, setSeeded] = useState<User | null>(null);
  if (me && me !== seeded) {
    setSeeded(me);
    setUser(me);
    setName(me.name ?? "");
    setEmail(me.email ?? "");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const found: { name?: string; email?: string } = {};
    if (!name.trim()) found.name = t("errName");
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) {
      found.email = t("errEmail");
    }
    setErrors(found);
    if (found.name) {
      document.getElementById(nameId)?.focus();
      return;
    }
    if (found.email) {
      document.getElementById(emailId)?.focus();
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const updated = await api.updateMe({
        name: name.trim(),
        email: email.trim() || null,
      });
      setUser(updated);
      showToast(t("saved"));
    } catch {
      setSaveError(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (failed) return <AccountError onRetry={reload} />;
  if (!me) return <AccountSkeleton />;

  return (
    <Card padding="md">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {saveError ? (
          <p
            role="alert"
            data-testid="profile-error"
            className="rounded-md border border-error/40 bg-error/8 px-3 py-2 text-sm font-medium text-error-dark"
          >
            {saveError}
          </p>
        ) : null}

        <Field label={t("name")} htmlFor={nameId} error={errors.name}>
          <Input
            id={nameId}
            name="name"
            autoComplete="name"
            value={name}
            invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? fieldErrorId(nameId) : undefined}
            placeholder={t("namePlaceholder")}
            data-testid="profile-name"
            onChange={(event) => {
              setName(event.target.value);
              if (errors.name) setErrors({ ...errors, name: undefined });
            }}
          />
        </Field>

        <Field
          label={t("email")}
          htmlFor={emailId}
          error={errors.email}
          hint={t("emailHint")}
        >
          <Input
            id={emailId}
            name="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            value={email ?? ""}
            invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? fieldErrorId(emailId) : undefined}
            placeholder={t("emailPlaceholder")}
            data-testid="profile-email"
            onChange={(event) => {
              setEmail(event.target.value);
              if (errors.email) setErrors({ ...errors, email: undefined });
            }}
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text ps-0.5">
            {t("phoneLocked")}
          </span>
          <p
            dir="ltr"
            className="rounded-md border border-border bg-card px-4 py-3 text-sm font-semibold text-text-muted [unicode-bidi:isolate]"
          >
            {user?.phone}
          </p>
        </div>

        <p className="flex items-start gap-1.5 text-xs text-text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("emailHint")}
        </p>

        <Button
          type="submit"
          variant="cta"
          size="lg"
          disabled={saving}
          data-testid="profile-save"
          startIcon={
            saving ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null
          }
          className="self-start"
        >
          {saving ? t("saving") : t("save")}
        </Button>
      </form>
    </Card>
  );
}
