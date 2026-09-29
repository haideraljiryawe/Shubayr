"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Lock, TriangleAlert } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { useApiForm } from "@/components/forms/use-api-form";
import { browserApi, unwrap } from "@/lib/api/client";
import { errorKind, type ErrorKind } from "@/lib/api/errors";
import { storeDateTimeLocal, storeDay, storeLocalToIso } from "@/lib/finance/dates";
import { decimalPlaces, formatRate as rateText, isPositive, per100ToPer1 } from "@/lib/finance/money";
import type { components } from "@/types/api";

type Currency = components["schemas"]["Currency"];
type ExchangeRate = components["schemas"]["ExchangeRate"];

export function CurrenciesView({
  currencies,
  rates,
  authors,
  canToggle,
  canRate,
}: {
  currencies: Currency[];
  rates: ExchangeRate[];
  authors: Record<string, string>;
  canToggle: boolean;
  canRate: boolean;
}) {
  const t = useTranslations("currencies");
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const toast = useToast();
  const base = currencies.find((currency) => currency.is_base);
  const baseCode = base?.code ?? "IQD";
  const foreign = currencies.filter((currency) => !currency.is_base && currency.enabled);

  const [toggling, setToggling] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<{ code: string; kind: ErrorKind; detail: string } | null>(null);

  async function toggle(currency: Currency) {
    setToggling(currency.code);
    setToggleError(null);
    try {
      await unwrap(
        browserApi.PATCH("/admin/currencies/{code}", {
          params: { path: { code: currency.code } },
          body: { enabled: !currency.enabled },
        }),
      );
      toast(currency.enabled ? t("disabled") : t("enabled"));
      router.refresh();
    } catch (cause) {
      setToggleError({
        code: currency.code,
        kind: errorKind(cause),
        detail: cause instanceof Error ? cause.message : "",
      });
    } finally {
      setToggling(null);
    }
  }

  const dateTime = (iso: string | null | undefined) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" }) : "—";

  // Newest first per currency, so each rate's predecessor is the next row.
  const byCurrency = new Map<string, ExchangeRate[]>();
  for (const rate of rates) {
    const code = rate.currency_code ?? "";
    byCurrency.set(code, [...(byCurrency.get(code) ?? []), rate]);
  }
  const previousOf = (rate: ExchangeRate) => {
    const list = byCurrency.get(rate.currency_code ?? "") ?? [];
    return list[list.indexOf(rate) + 1] ?? null;
  };
  const staleLatest = [...byCurrency.entries()]
    .map(([code, list]) => ({ code, latest: list[0] }))
    .filter(({ latest }) => latest?.not_from_today);

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5">
        <h2 className="mb-3 text-lg font-bold">{t("currencies")}</h2>
        <table className="w-full text-sm" data-testid="currency-table">
          <thead className="text-text-muted">
            <tr>
              <th className="py-1 text-start font-semibold">{t("columns.code")}</th>
              <th className="py-1 text-start font-semibold">{t("columns.name")}</th>
              <th className="py-1 text-start font-semibold">{t("columns.symbol")}</th>
              <th className="py-1 text-start font-semibold">{t("columns.precision")}</th>
              <th className="py-1 text-start font-semibold">{t("columns.status")}</th>
            </tr>
          </thead>
          <tbody>
            {currencies.map((currency) => (
              <tr key={currency.code} className="border-t border-border" data-testid={`currency-${currency.code}`}>
                <td className="py-2 font-semibold" dir="ltr">{currency.code}</td>
                <td className="py-2">{locale === "ar" ? currency.name_ar : currency.name_en}</td>
                <td className="py-2" dir="ltr">{currency.symbol}</td>
                <td className="py-2">{currency.display_precision}</td>
                <td className="py-2">
                  {currency.is_base ? (
                    <span className="inline-flex items-center gap-1" data-testid="currency-base">
                      <Lock className="size-3.5" aria-hidden />
                      <Badge tone="info">{t("base")}</Badge>
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Badge tone={currency.enabled ? "success" : "neutral"}>
                        {currency.enabled ? t("on") : t("off")}
                      </Badge>
                      {canToggle ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          pending={toggling === currency.code}
                          onClick={() => void toggle(currency)}
                          data-testid={`currency-toggle-${currency.code}`}
                        >
                          {currency.enabled ? t("disable") : t("enable")}
                        </Button>
                      ) : null}
                    </div>
                  )}
                  {toggleError?.code === currency.code ? (
                    <FormError kind={toggleError.kind} detail={toggleError.detail} />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-text-muted">{t("baseLocked")}</p>
      </Card>

      {staleLatest.map(({ code, latest }) => (
        <Alert key={code} tone="info" data-testid={`rate-stale-${code}`}>
          <span className="inline-flex items-center gap-2">
            <TriangleAlert className="size-4" aria-hidden />
            {t("staleCurrent", { code, date: dateTime(latest.effective_at) })}
          </span>
        </Alert>
      ))}

      {canRate ? (
        foreign.length ? (
          <RateForm foreign={foreign} baseCode={baseCode} onSaved={() => router.refresh()} />
        ) : (
          <Alert tone="info">{t("noForeign")}</Alert>
        )
      ) : null}

      <Card className="overflow-x-auto p-5">
        <h2 className="mb-3 text-lg font-bold">{t("history.title")}</h2>
        {rates.length === 0 ? (
          <p className="text-sm text-text-muted" data-testid="rate-history-empty">{t("history.empty")}</p>
        ) : (
          <table className="w-full text-sm" data-testid="rate-history">
            <thead className="text-text-muted">
              <tr>
                <th className="py-1 text-start font-semibold">{t("history.effective")}</th>
                <th className="py-1 text-start font-semibold">{t("history.rate")}</th>
                <th className="py-1 text-start font-semibold">{t("history.previous")}</th>
                <th className="py-1 text-start font-semibold">{t("history.by")}</th>
                <th className="py-1 text-start font-semibold">{t("history.reason")}</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((rate) => {
                const previous = previousOf(rate);
                return (
                  <tr key={rate.id} className="border-t border-border align-top" data-testid="rate-row" data-rate={String(rate.rate)}>
                    <td className="py-2">
                      {dateTime(rate.effective_at)}
                      <span className="block text-xs text-text-muted">
                        {t("history.recorded", { at: dateTime(rate.created_at) })}
                      </span>
                    </td>
                    <td className="py-2 font-semibold" dir="ltr">
                      {rateText(rate.currency_code ?? "", rate.base_currency_code ?? baseCode, rate.rate ?? "0", locale)}
                    </td>
                    <td className="py-2 text-text-muted" dir="ltr">
                      {previous ? `${String(previous.rate)} → ${String(rate.rate)}` : t("history.first")}
                    </td>
                    <td className="py-2">{(rate.id && authors[rate.id]) || shortId(rate.set_by)}</td>
                    <td className="py-2">{rate.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function shortId(id: string | undefined): string {
  return id ? id.slice(0, 8) : "—";
}

/**
 * Recording a rate. The direction is written out — "1 USD = … IQD" — and
 * the rate field starts EMPTY: a rate of 1 is never assumed. "Per 100" lets
 * someone type the figure the market quotes (e.g. 145,000 IQD per 100 USD);
 * the per-1 value it becomes is previewed before saving, and the API
 * normalises it the same way.
 */
function RateForm({
  foreign,
  baseCode,
  onSaved,
}: {
  foreign: Currency[];
  baseCode: string;
  onSaved: () => void;
}) {
  const t = useTranslations("currencies");
  const locale = useLocale();
  const toast = useToast();
  const api = useApiForm();
  const [code, setCode] = useState(foreign[0]?.code ?? "");
  const [basis, setBasis] = useState<1 | 100>(1);
  const [rate, setRate] = useState<string | null>(null);
  const [rateText_, setRateText] = useState("");
  const [effective, setEffective] = useState(() => storeDateTimeLocal());
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Remounts the rate field (clearing its text) after a save.
  const [generation, setGeneration] = useState(0);

  const perOne = rate && isPositive(rate) ? (basis === 100 ? per100ToPer1(rate) : rate) : null;
  const notToday = effective.slice(0, 10) !== storeDay();

  async function submit() {
    const found: Record<string, string> = {};
    if (!rateText_.trim()) found.rate = t("errors.rateRequired");
    else if (rate === null) found.rate = t("errors.rateInvalid");
    else if (!isPositive(rate)) found.rate = t("errors.ratePositive");
    else if (decimalPlaces(rate) > 10) found.rate = t("errors.rateDecimals");
    const at = storeLocalToIso(effective);
    if (!at) found.effective_at = t("errors.effective");
    if (reason.trim().length < 3) found.reason = t("errors.reason");
    setErrors(found);
    if (Object.keys(found).length || !rate || !at) return;

    const saved = await api.run(() =>
      unwrap(
        browserApi.POST("/admin/exchange-rates", {
          body: { currency_code: code, rate, basis, effective_at: at, reason: reason.trim() },
        }),
      ),
    );
    if (!saved) return;
    toast(t("rateSaved", { rate: rateText(code, baseCode, saved.rate ?? perOne ?? "", locale) }));
    setRate(null);
    setRateText("");
    setReason("");
    setGeneration((value) => value + 1);
    onSaved();
  }

  const fieldError = (name: string) => errors[name] ?? api.fieldErrors[name] ?? null;

  return (
    <Card className="p-5">
      <form
        className="flex flex-col gap-4"
        data-testid="rate-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 className="text-lg font-bold">{t("form.title")}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t("form.currency")} name="currency_code" error={api.fieldErrors.currency_code}>
            <Select value={code} onChange={(event) => setCode(event.target.value)} data-testid="rate-currency">
              {foreign.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code} · {locale === "ar" ? currency.name_ar : currency.name_en}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset className="flex flex-col gap-1 text-sm font-semibold">
            <legend className="mb-1">{t("form.basis")}</legend>
            {([1, 100] as const).map((value) => (
              <label key={value} className="flex items-center gap-2 font-normal">
                <input
                  type="radio"
                  name="basis"
                  checked={basis === value}
                  onChange={() => setBasis(value)}
                  data-testid={`rate-basis-${value}`}
                />
                <span dir="ltr">{`${value} ${code} = … ${baseCode}`}</span>
              </label>
            ))}
          </fieldset>
          <Field
            key={generation}
            label={t("form.rate", { amount: basis, code, base: baseCode })}
            name="rate"
            error={fieldError("rate")}
          >
            <DecimalInput
              value=""
              placeholder={t("form.ratePlaceholder")}
              parse={{ maxDecimals: 10 }}
              data-testid="rate-value"
              onValueChange={(value, text) => {
                setRate(value);
                setRateText(text);
                setErrors((current) => {
                  const rest = { ...current };
                  delete rest.rate;
                  return rest;
                });
              }}
            />
          </Field>
        </div>

        <p className="rounded-md bg-card px-4 py-3 text-sm" data-testid="rate-preview" aria-live="polite">
          {perOne ? (
            <>
              {basis === 100 ? (
                <span className="block text-text-muted" dir="ltr">
                  {`100 ${code} = ${rate} ${baseCode}`}
                </span>
              ) : null}
              <strong dir="ltr" data-testid="rate-preview-per1">{rateText(code, baseCode, perOne, locale)}</strong>
            </>
          ) : (
            <span className="text-text-muted">{t("form.previewEmpty", { code, base: baseCode })}</span>
          )}
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("form.effective")} name="effective_at" error={fieldError("effective_at")} hint={t("form.effectiveHint")}>
            <Input
              type="datetime-local"
              value={effective}
              onChange={(event) => setEffective(event.target.value)}
              data-testid="rate-effective"
            />
          </Field>
          <Field label={t("form.reason")} name="reason" error={fieldError("reason")}>
            <Textarea
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              data-testid="rate-reason"
            />
          </Field>
        </div>
        {notToday ? (
          <Alert tone="info" data-testid="rate-not-today">{t("form.notToday")}</Alert>
        ) : null}
        <FormError kind={api.formError} detail={api.formErrorDetail} />
        <div className="flex justify-end">
          <Button type="submit" pending={api.pending} data-testid="rate-submit">
            {t("form.submit")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
