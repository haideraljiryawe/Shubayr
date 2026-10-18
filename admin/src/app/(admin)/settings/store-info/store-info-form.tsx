"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert, Button, Card, Input, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError, errorKind, type ErrorKind } from "@/lib/api/errors";
import {
  MAX_LENGTH,
  storeInfoApiProblems,
  storeInfoPatch,
  toStoreInfoForm,
  validateStoreInfo,
  type AdminSettings,
  type StoreInfoForm as Form,
  type StoreInfoKey,
  type StoreInfoProblem,
} from "@/lib/store-info";

type Problems = Partial<Record<StoreInfoKey, StoreInfoProblem>>;

/** The form's sections, each a row of Arabic/English or related fields. */
const SECTIONS: ReadonlyArray<{ key: string; rows: ReadonlyArray<readonly StoreInfoKey[]> }> = [
  { key: "legal", rows: [["store_legal_name_ar", "store_legal_name_en"], ["store_address_ar", "store_address_en"]] },
  { key: "contact", rows: [["support_phone", "support_whatsapp"], ["support_email", "privacy_email"], ["support_hours_ar", "support_hours_en"]] },
  { key: "policy", rows: [["return_window_days", "refund_days"], ["policy_effective_date"]] },
];

const LONG: ReadonlySet<StoreInfoKey> = new Set(["store_address_ar", "store_address_en", "support_hours_ar", "support_hours_en"]);
const ARABIC: ReadonlySet<StoreInfoKey> = new Set(["store_legal_name_ar", "store_address_ar", "support_hours_ar"]);
const LATIN: ReadonlySet<StoreInfoKey> = new Set(["support_phone", "support_whatsapp", "support_email", "privacy_email", "return_window_days", "refund_days", "policy_effective_date"]);

export function StoreInfoForm({ settings }: { settings: AdminSettings }) {
  const t = useTranslations("storeInfo");
  const router = useRouter();
  const toast = useToast();
  const [saved, setSaved] = useState(() => toStoreInfoForm(settings));
  const [form, setForm] = useState(() => toStoreInfoForm(settings));
  const [problems, setProblems] = useState<Problems>({});
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<{ kind: ErrorKind; detail: string | null } | null>(null);
  const [unchanged, setUnchanged] = useState(false);

  function set(key: StoreInfoKey, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setProblems((current) => {
      if (!(key in current)) return current;
      const rest = { ...current };
      delete rest[key];
      return rest;
    });
  }

  async function save() {
    if (pending) return;
    setUnchanged(false);
    setFormError(null);
    const found = validateStoreInfo(form);
    setProblems(found);
    if (Object.keys(found).length) return;
    const patch = storeInfoPatch(saved, form);
    if (!patch) {
      setUnchanged(true);
      return;
    }
    setPending(true);
    try {
      const result = await unwrap(browserApi.PUT("/admin/settings", { body: patch }));
      const next = toStoreInfoForm(result);
      setSaved(next);
      setForm(next);
      toast(t("saved"));
      router.refresh();
    } catch (cause) {
      const fromApi = storeInfoApiProblems(cause);
      if (Object.keys(fromApi).length) setProblems(fromApi);
      else setFormError({ kind: errorKind(cause), detail: cause instanceof ApiError ? cause.message : null });
    } finally {
      setPending(false);
    }
  }

  const field = (key: StoreInfoKey) => {
    const problem = problems[key];
    const control = LONG.has(key) ? (
      <Textarea rows={2} maxLength={MAX_LENGTH[key]} value={form[key]} disabled={pending} dir={ARABIC.has(key) ? "rtl" : "auto"} onChange={(event) => set(key, event.target.value)} data-testid={`store-info-${key}`} />
    ) : (
      <Input
        type={key === "policy_effective_date" ? "date" : "text"}
        inputMode={key === "return_window_days" || key === "refund_days" ? "numeric" : key.includes("email") ? "email" : key.includes("phone") || key.includes("whatsapp") ? "tel" : undefined}
        maxLength={MAX_LENGTH[key]}
        dir={LATIN.has(key) ? "ltr" : ARABIC.has(key) ? "rtl" : "auto"}
        value={form[key]}
        disabled={pending}
        onChange={(event) => set(key, event.target.value)}
        data-testid={`store-info-${key}`}
      />
    );
    return (
      <Field key={key} label={t(`fields.${key}`)} hint={t.has(`hints.${key}`) ? t(`hints.${key}`) : undefined} error={problem ? t(`problems.${problem}`, { max: MAX_LENGTH[key] ?? 0 }) : null} name={key}>
        {control}
      </Field>
    );
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      data-testid="store-info-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Alert tone="info">{t("intro")}</Alert>
      {SECTIONS.map((section) => (
        <Card key={section.key} className="flex flex-col gap-4" data-testid={`store-info-section-${section.key}`}>
          <h2 className="text-lg font-bold">{t(`sections.${section.key}`)}</h2>
          {section.rows.map((row) => (
            <div key={row.join("-")} className="grid gap-4 md:grid-cols-2">
              {row.map(field)}
            </div>
          ))}
        </Card>
      ))}
      {unchanged ? <Alert tone="info" data-testid="store-info-unchanged">{t("unchanged")}</Alert> : null}
      {formError ? <FormError kind={formError.kind} detail={formError.detail} /> : null}
      <div className="flex justify-end">
        <Button type="submit" pending={pending} data-testid="store-info-save">
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
