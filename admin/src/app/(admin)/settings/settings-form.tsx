"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Alert, Button, Card, Input } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { useApiForm } from "@/components/forms/use-api-form";
import { browserApi, unwrap } from "@/lib/api/client";
import {
  THRESHOLD_KEYS,
  buildPatch,
  isEmptyPatch,
  settingChanges,
  toForm,
  validate,
  type AdminSettings,
  type NumberKey,
  type SettingsErrors,
  type SettingsForm as Form,
} from "@/lib/finance/settings";

export interface SettingsAudit {
  id: string;
  at: string;
  actor: string | null;
  before: unknown;
  after: unknown;
}

/** Each number's unit, shown next to its field. */
const UNITS: Record<NumberKey, "currency" | "minutes" | "days" | "units" | "percent"> = {
  delivery_fee: "currency",
  acceptance_alert_timeout_minutes: "minutes",
  auto_cancel_timeout_minutes: "minutes",
  auto_cancel_warning_minutes: "minutes",
  default_low_stock_threshold: "units",
  backdating_window_days: "days",
  markup_alert_percent: "percent",
  sale_rounding_multiple: "currency",
};

export function SettingsForm({
  settings,
  baseCurrency,
  basePrecision,
  history,
}: {
  settings: AdminSettings;
  baseCurrency: string;
  basePrecision: number;
  history: SettingsAudit[] | null;
}) {
  const t = useTranslations("financeSettings");
  const format = useFormatter();
  const router = useRouter();
  const toast = useToast();
  const api = useApiForm();
  const [saved, setSaved] = useState(() => toForm(settings));
  const [form, setForm] = useState(() => toForm(settings));
  // Bumped after a save so the number fields remount with the saved text.
  const [generation, setGeneration] = useState(0);
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [unchanged, setUnchanged] = useState(false);

  const error = (path: string) => (errors[path] ? t(`errors.${errors[path]}`) : null);
  const update = (change: (draft: Form) => void) =>
    setForm((current) => {
      const next = structuredClone(current);
      change(next);
      return next;
    });

  async function save() {
    setUnchanged(false);
    const found = validate(form, basePrecision);
    setErrors(found);
    if (Object.keys(found).length) return;
    const patch = buildPatch(saved, form);
    if (isEmptyPatch(patch)) {
      setUnchanged(true);
      return;
    }
    const result = await api.run(() => unwrap(browserApi.PUT("/admin/settings", { body: patch })));
    if (!result) return;
    const next = toForm(result);
    setSaved(next);
    setForm(next);
    setGeneration((value) => value + 1);
    toast(t("saved"));
    router.refresh();
  }

  const numberField = (key: NumberKey) => (
    <Field key={`${key}-${generation}`} label={t(`fields.${key}`)} error={error(`numbers.${key}`)} hint={key === "sale_rounding_multiple" ? t("roundingHint") : t(`units.${UNITS[key]}`, { currency: baseCurrency })} name={key}>
      <DecimalInput
        value={form.numbers[key]}
        data-testid={`setting-${key}`}
        parse={{ maxDecimals: key === "delivery_fee" ? basePrecision : key === "markup_alert_percent" ? 2 : 0 }}
        onValueChange={(_value, text) => update((draft) => void (draft.numbers[key] = text))}
      />
    </Field>
  );

  const weekdayName = (weekday: number) =>
    format.dateTime(new Date(Date.UTC(2026, 8, 27 + weekday)), { weekday: "long", timeZone: "UTC" });

  return (
    <form
      className="flex flex-col gap-6"
      data-testid="settings-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Section title={t("sections.store")}>
        <div className="grid gap-4 md:grid-cols-2">
          {(["store_name", "store_address", "store_phone", "timezone"] as const).map((key) => (
            <Field key={key} label={t(`fields.${key}`)} error={error(`text.${key}`)} hint={key === "timezone" ? t("timezoneHint") : undefined} name={key}>
              <Input
                value={form.text[key]}
                dir={key === "store_phone" || key === "timezone" ? "ltr" : undefined}
                data-testid={`setting-${key}`}
                onChange={(event) => update((draft) => void (draft.text[key] = event.target.value))}
              />
            </Field>
          ))}
          {numberField("delivery_fee")}
        </div>
      </Section>

      <Section title={t("sections.hours")}>
        <table className="w-full text-sm" data-testid="business-hours">
          <thead className="text-text-muted">
            <tr>
              <th className="py-1 text-start font-semibold">{t("hours.day")}</th>
              <th className="py-1 text-start font-semibold">{t("hours.closed")}</th>
              <th className="py-1 text-start font-semibold">{t("hours.opens")}</th>
              <th className="py-1 text-start font-semibold">{t("hours.closes")}</th>
            </tr>
          </thead>
          <tbody>
            {form.hours.map((row, index) => (
              <tr key={row.weekday} className="border-t border-border" data-testid={`hours-${row.weekday}`}>
                <td className="py-2 font-semibold">{weekdayName(row.weekday)}</td>
                <td className="py-2">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={row.is_closed}
                    aria-label={t("hours.closedFor", { day: weekdayName(row.weekday) })}
                    onChange={(event) => update((draft) => void (draft.hours[index].is_closed = event.target.checked))}
                  />
                </td>
                {(["opens_at", "closes_at"] as const).map((key) => (
                  <td key={key} className="py-2 pe-2">
                    <Input
                      type="time"
                      className="h-9"
                      value={row[key]}
                      disabled={row.is_closed}
                      aria-invalid={errors[`hours.${index}.${key}`] ? true : undefined}
                      onChange={(event) => update((draft) => void (draft.hours[index][key] = event.target.value))}
                    />
                    {error(`hours.${index}.${key}`) ? (
                      <span role="alert" className="text-xs font-semibold text-error-dark">
                        {error(`hours.${index}.${key}`)}
                      </span>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex flex-col gap-2" data-testid="closed-days">
          <h3 className="font-semibold">{t("closedDays.title")}</h3>
          {form.closedDays.length === 0 ? <p className="text-sm text-text-muted">{t("closedDays.none")}</p> : null}
          {form.closedDays.map((day, index) => (
            <div key={index} className="flex flex-wrap items-start gap-2">
              <div className="flex flex-col">
                <Input
                  type="date"
                  className="h-9"
                  value={day.date}
                  aria-label={t("closedDays.date")}
                  onChange={(event) => update((draft) => void (draft.closedDays[index].date = event.target.value))}
                />
                {error(`closedDays.${index}.date`) ? (
                  <span role="alert" className="text-xs font-semibold text-error-dark">
                    {error(`closedDays.${index}.date`)}
                  </span>
                ) : null}
              </div>
              <Input
                className="h-9 min-w-48 flex-1"
                value={day.reason}
                placeholder={t("closedDays.reason")}
                aria-label={t("closedDays.reason")}
                onChange={(event) => update((draft) => void (draft.closedDays[index].reason = event.target.value))}
              />
              <Button
                size="sm"
                variant="ghost"
                aria-label={t("closedDays.remove")}
                onClick={() => update((draft) => void draft.closedDays.splice(index, 1))}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
          <div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => update((draft) => void draft.closedDays.push({ date: "", reason: "" }))}
              data-testid="closed-day-add"
            >
              <Plus className="size-4" aria-hidden />
              {t("closedDays.add")}
            </Button>
          </div>
        </div>
      </Section>

      <Section title={t("sections.orders")}>
        <div className="grid gap-4 md:grid-cols-3">
          {numberField("acceptance_alert_timeout_minutes")}
          <label className="flex items-center gap-2 self-center text-sm font-semibold">
            <input
              type="checkbox"
              className="size-4"
              checked={form.autoCancel}
              data-testid="setting-auto_cancel_enabled"
              onChange={(event) => update((draft) => void (draft.autoCancel = event.target.checked))}
            />
            {t("fields.auto_cancel_enabled")}
          </label>
          <div />
          {form.autoCancel ? (
            <>
              {numberField("auto_cancel_timeout_minutes")}
              {numberField("auto_cancel_warning_minutes")}
            </>
          ) : (
            <p className="text-sm text-text-muted md:col-span-2">{t("autoCancelOff")}</p>
          )}
        </div>
      </Section>

      <Section title={t("sections.controls")}>
        <div className="grid gap-4 md:grid-cols-3">
          {numberField("default_low_stock_threshold")}
          {numberField("backdating_window_days")}
          {numberField("markup_alert_percent")}
          {numberField("sale_rounding_multiple")}
        </div>
        <h3 className="mt-4 font-semibold">{t("thresholds.title")}</h3>
        <p className="text-sm text-text-muted">{t("thresholds.body")}</p>
        <div className="mt-2 grid gap-4 md:grid-cols-4">
          {THRESHOLD_KEYS.map((key) => (
            <Field key={`${key}-${generation}`} label={t(`thresholds.${key}`)} error={error(`thresholds.${key}`)} hint={t("units.percent")} name={`threshold_${key}`}>
              <DecimalInput
                value={form.thresholds[key]}
                data-testid={`threshold-${key}`}
                parse={{ maxDecimals: 2 }}
                onValueChange={(_value, text) => update((draft) => void (draft.thresholds[key] = text))}
              />
            </Field>
          ))}
        </div>
      </Section>

      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-background/95 py-3">
        {Object.keys(errors).length ? (
          <Alert data-testid="settings-invalid">{t("fixErrors")}</Alert>
        ) : null}
        {unchanged ? <Alert tone="info">{t("noChanges")}</Alert> : null}
        <FormError kind={api.formError} detail={api.formErrorDetail} />
        <div className="flex justify-end">
          <Button type="submit" pending={api.pending} data-testid="settings-save">
            {t("save")}
          </Button>
        </div>
      </div>

      <Section title={t("history.title")}>
        {history === null ? (
          <p className="text-sm text-text-muted" data-testid="settings-history-hidden">
            {t("history.needsAudit")}
          </p>
        ) : history.length === 0 ? (
          <p className="text-sm text-text-muted">{t("history.empty")}</p>
        ) : (
          <ol className="flex flex-col gap-3" data-testid="settings-history">
            {history.map((entry) => (
              <li key={entry.id} className="border-s-2 border-primary/40 ps-3">
                <p className="text-sm font-semibold">
                  {entry.actor ?? t("history.unknownActor")} ·{" "}
                  <span className="font-normal text-text-muted">
                    {format.dateTime(new Date(entry.at), { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" })}
                  </span>
                </p>
                <ul className="mt-1 text-sm">
                  {settingChanges(entry.before, entry.after).map((change) => (
                    <li key={change.field} data-testid="settings-change" data-field={change.field}>
                      <span className="text-text-muted">{fieldLabel(t, change.field)}:</span>{" "}
                      <span dir="ltr">{change.before || "—"}</span> → <span dir="ltr">{change.after || "—"}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {children}
    </Card>
  );
}

/** A readable name for an audit field path, falling back to the path. */
function fieldLabel(t: ReturnType<typeof useTranslations>, field: string): string {
  const [group, key] = field.split(".");
  if (group === "settings" && t.has(`fields.${key}`)) return t(`fields.${key}`);
  if (group === "protection_thresholds" && t.has(`thresholds.${key}`)) return t(`thresholds.${key}`);
  if (group === "business_hours") return t("history.hoursOf", { day: key });
  if (group === "closed_days") return t("closedDays.title");
  return field;
}
