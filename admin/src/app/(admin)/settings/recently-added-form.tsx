"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert, Button, Card, Input } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { browserApi, unwrap } from "@/lib/api/client";
import { errorCode, errorKind, type ErrorKind } from "@/lib/api/errors";
import {
  MAX_COUNT_BOUNDS,
  WINDOW_BOUNDS,
  recentlyAddedApiProblems,
  recentlyAddedPatch,
  toRecentlyAddedForm,
  validateRecentlyAdded,
  type RecentlyAddedField,
  type RecentlyAddedProblem,
} from "@/lib/recently-added";
import type { AdminSettings } from "@/lib/store-info";

type Problems = Partial<Record<RecentlyAddedField, RecentlyAddedProblem>>;

/**
 * Settings → Recently Added: on/off, how many products at most, and how far
 * back (days). Saved on its own (PUT /admin/settings, only what changed), with
 * the API's bounds checked first and its field errors shown under each field.
 */
export function RecentlyAddedForm({ settings }: { settings: AdminSettings }) {
  const t = useTranslations("recentlyAdded");
  const router = useRouter();
  const toast = useToast();
  const [saved, setSaved] = useState(() => toRecentlyAddedForm(settings));
  const [form, setForm] = useState(saved);
  const [problems, setProblems] = useState<Problems>({});
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<{ kind: ErrorKind; code: string | null } | null>(null);
  const [unchanged, setUnchanged] = useState(false);

  function set(patch: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...patch }));
    setUnchanged(false);
    setProblems((current) => {
      const rest = { ...current };
      for (const key of Object.keys(patch) as RecentlyAddedField[]) delete rest[key];
      return rest;
    });
  }

  async function save() {
    if (pending) return;
    setFormError(null);
    const found = validateRecentlyAdded(form);
    setProblems(found);
    if (Object.keys(found).length) return;
    const patch = recentlyAddedPatch(saved, form);
    if (!patch) {
      setUnchanged(true);
      return;
    }
    setPending(true);
    try {
      const result = await unwrap(browserApi.PUT("/admin/settings", { body: patch }));
      const next = toRecentlyAddedForm(result);
      setSaved(next);
      setForm(next);
      toast(t("saved"));
      router.refresh();
    } catch (cause) {
      const fromApi = recentlyAddedApiProblems(cause);
      if (Object.keys(fromApi).length) setProblems(fromApi);
      else setFormError({ kind: errorKind(cause), code: errorCode(cause) ?? null });
    } finally {
      setPending(false);
    }
  }

  const message = (field: RecentlyAddedField) => {
    const problem = problems[field];
    if (!problem) return null;
    const bounds = field === "maxCount" ? MAX_COUNT_BOUNDS : WINDOW_BOUNDS;
    return t(`problems.${problem}`, { min: bounds.min, max: bounds.max });
  };

  return (
    <form
      noValidate
      className="mt-6"
      data-testid="recently-added-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-bold">{t("title")}</h2>
        <p className="text-sm text-text-muted">{t("intro")}</p>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={form.enabled} disabled={pending} onChange={(e) => set({ enabled: e.target.checked })} data-testid="recently-added-enabled" />
          {t("enabled")}
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("maxCount")} name="recently_added_max_count" hint={t("maxCountHint", MAX_COUNT_BOUNDS)} error={message("maxCount")}>
            <Input inputMode="numeric" dir="ltr" value={form.maxCount} disabled={pending} onChange={(e) => set({ maxCount: e.target.value })} data-testid="recently-added-max-count" />
          </Field>
          <Field label={t("windowDays")} name="recently_added_window_days" hint={t("windowDaysHint", WINDOW_BOUNDS)} error={message("windowDays")}>
            <Input inputMode="numeric" dir="ltr" value={form.windowDays} disabled={pending} onChange={(e) => set({ windowDays: e.target.value })} data-testid="recently-added-window-days" />
          </Field>
        </div>
        <p className="text-xs text-text-muted">{form.enabled ? t("rules") : t("off")}</p>
        {unchanged ? (
          <Alert tone="info" data-testid="recently-added-unchanged">
            {t("unchanged")}
          </Alert>
        ) : null}
        {formError ? <FormError kind={formError.kind} code={formError.code} /> : null}
        <div className="flex justify-end">
          <Button type="submit" pending={pending} data-testid="recently-added-save">
            {t("save")}
          </Button>
        </div>
      </Card>
    </form>
  );
}
