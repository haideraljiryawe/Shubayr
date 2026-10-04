"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, RefreshCw } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { useApiForm } from "@/components/forms/use-api-form";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { changeDirection, formatPercentChange, STALE_PREVIEW } from "@/lib/catalog";
import { storeDateTimeLocal, storeDay, storeLocalToIso } from "@/lib/finance/dates";
import { decimalPlaces, formatAmount, formatRate as rateText, isPositive, per100ToPer1 } from "@/lib/finance/money";
import type { components } from "@/types/api";

type Currency = components["schemas"]["Currency"];
type Preview = components["schemas"]["LinkedPricePreview"];

interface Request {
  currency_code: string;
  rate: number;
  basis: 1 | 100;
  effective_at: string;
  reason: string;
}

/**
 * Changing an exchange rate, in two steps.
 *
 * 1. The rate is entered with its direction written out — "1 USD = … IQD",
 *    never pre-filled, a rate of 1 never assumed — and previewed: every SKU
 *    priced from this currency, its published price now and after, and the
 *    change, decreases included.
 * 2. Two explicit choices: save the rate only (published prices stay and are
 *    marked as awaiting it), or save the rate and publish the linked prices
 *    as one consistent version.
 *
 * A preview the server no longer honours — it expired, or a rate, a linked
 * SKU or the rounding rule changed since — is refused as stale; nothing is
 * saved, and the person refreshes it and reviews the new figures.
 */
export function RateForm({
  foreign,
  baseCode,
  basePrecision,
  canPublish,
  onSaved,
}: {
  foreign: Currency[];
  baseCode: string;
  basePrecision: number;
  canPublish: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("currencies");
  const tl = useTranslations("linkedPrices");
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
  const [preview, setPreview] = useState<{ request: Request; data: Preview } | null>(null);
  const [stale, setStale] = useState(false);
  const [applying, setApplying] = useState<"rate_only" | "published" | null>(null);
  /**
   * A below-cost publish the proposer has sent for approval: it stays on
   * screen as "waiting for another approver" (never with an approve button —
   * the server also refuses the proposer's own decision).
   */
  const [waiting, setWaiting] = useState<{ id: string; items: Preview["items"]; rate: string } | null>(null);

  const perOne = rate && isPositive(rate) ? (basis === 100 ? per100ToPer1(rate) : rate) : null;
  const notToday = effective.slice(0, 10) !== storeDay();
  const money = (value: number | null | undefined) => formatAmount(value ?? null, baseCode, basePrecision, locale);

  /** Any edit after a preview discards it: what is saved is what was reviewed. */
  function edited() {
    setPreview(null);
    setStale(false);
  }

  async function requestPreview(request: Request) {
    const data = await api.run(() => unwrap(browserApi.POST("/admin/exchange-rates/linked-price-preview", { body: request })));
    if (!data) return;
    setPreview({ request, data });
    setStale(false);
  }

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
    await requestPreview({ currency_code: code, rate: Number(rate), basis, effective_at: at, reason: reason.trim() });
  }

  async function apply(mode: "rate_only" | "published") {
    if (!preview || stale) return;
    setApplying(mode);
    const body = {
      preview_token: preview.data.preview_token,
      below_cost_override_reason: preview.request.reason,
    };
    const result = await api.run(async () => {
      try {
        return mode === "published"
          ? await unwrap(browserApi.POST("/admin/exchange-rates/publish-linked-prices", { body }))
          : await unwrap(browserApi.POST("/admin/exchange-rates/save-rate-only", { body }));
      } catch (cause) {
        // Expired, changed underneath, or already used: never saved as is.
        if (cause instanceof ApiError && (cause.code === STALE_PREVIEW || cause.status === 404)) {
          setStale(true);
        }
        throw cause;
      }
    });
    setApplying(null);
    if (!result) return;
    const rateLabel = rateText(code, baseCode, String(preview.data.new_rate), locale);
    if (result.mode === "pending_approval" && result.approval_request_id) {
      setWaiting({ id: result.approval_request_id, items: preview.data.items, rate: rateLabel });
    }
    toast(
      result.mode === "pending_approval"
        ? tl("approvalPendingToast")
        : result.mode === "published"
          ? tl("publishedToast", { rate: rateLabel, count: result.linked_sku_count })
          : tl("rateOnlyToast", { rate: rateLabel, count: result.linked_sku_count }),
    );
    setPreview(null);
    setRate(null);
    setRateText("");
    setReason("");
    setGeneration((value) => value + 1);
    if (result.mode !== "pending_approval") onSaved();
  }

  const fieldError = (name: string) => errors[name] ?? api.fieldErrors[name] ?? null;

  return (
    <Card className="p-5">
      {waiting ? (
        <Alert tone="info" data-testid="price-approval-waiting" data-request={waiting.id}>
          <p className="font-semibold">{tl("waiting.title", { rate: waiting.rate })}</p>
          <p className="mt-1 text-sm">{tl("waiting.body")}</p>
          <p className="mt-2 text-sm">
            {tl("waiting.share")}{" "}
            <Link href={`/finance/price-approvals/${waiting.id}`} className="font-semibold underline" dir="ltr" data-testid="price-approval-link">
              /finance/price-approvals/{waiting.id}
            </Link>
          </p>
          <ul className="mt-2 list-inside list-disc text-sm" data-testid="price-approval-waiting-items">
            {waiting.items.map((item) => (
              <li key={item.variant_id} dir="ltr">
                {item.sku}: {money(item.old_price)} → {money(item.new_price)}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
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
            <Select
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                edited();
              }}
              data-testid="rate-currency"
            >
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
                  onChange={() => {
                    setBasis(value);
                    edited();
                  }}
                  data-testid={`rate-basis-${value}`}
                />
                <span dir="ltr">{`${value} ${code} = … ${baseCode}`}</span>
              </label>
            ))}
          </fieldset>
          <Field key={generation} label={t("form.rate", { amount: basis, code, base: baseCode })} name="rate" error={fieldError("rate")}>
            <DecimalInput
              value=""
              placeholder={t("form.ratePlaceholder")}
              parse={{ maxDecimals: 10 }}
              data-testid="rate-value"
              onValueChange={(value, text) => {
                setRate(value);
                setRateText(text);
                edited();
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
              <strong dir="ltr" data-testid="rate-preview-per1">
                {rateText(code, baseCode, perOne, locale)}
              </strong>
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
              onChange={(event) => {
                setEffective(event.target.value);
                edited();
              }}
              data-testid="rate-effective"
            />
          </Field>
          <Field label={t("form.reason")} name="reason" error={fieldError("reason")}>
            <Textarea
              value={reason}
              maxLength={500}
              onChange={(event) => {
                setReason(event.target.value);
                edited();
              }}
              data-testid="rate-reason"
            />
          </Field>
        </div>
        {notToday ? (
          <Alert tone="info" data-testid="rate-not-today">
            {t("form.notToday")}
          </Alert>
        ) : null}

        {preview ? (
          <LinkedPreviewPanel
            preview={preview.data}
            baseCode={baseCode}
            money={money}
            stale={stale}
          />
        ) : null}

        {stale && preview ? (
          <Alert data-testid="preview-stale">
            <p className="font-semibold">{tl("staleTitle")}</p>
            <p className="mt-1">{tl("staleBody")}</p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              pending={api.pending && applying === null}
              onClick={() => void requestPreview(preview.request)}
              data-testid="preview-refresh"
            >
              <RefreshCw className="size-4" aria-hidden />
              {tl("refresh")}
            </Button>
          </Alert>
        ) : (
          <FormError kind={api.formError} detail={api.formErrorDetail} />
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {preview ? (
            <>
              <Button variant="ghost" onClick={edited} disabled={api.pending} data-testid="preview-discard">
                {tl("discard")}
              </Button>
              <Button
                variant="secondary"
                disabled={stale || (api.pending && applying !== "rate_only")}
                pending={applying === "rate_only"}
                onClick={() => void apply("rate_only")}
                data-testid="rate-save-only"
              >
                {tl("saveRateOnly")}
              </Button>
              <Button
                disabled={stale || !canPublish || (api.pending && applying !== "published")}
                pending={applying === "published"}
                onClick={() => void apply("published")}
                title={canPublish ? undefined : tl("publishForbidden")}
                data-testid="rate-publish"
              >
                {tl("saveAndPublish")}
              </Button>
            </>
          ) : (
            <Button type="submit" pending={api.pending} data-testid="rate-submit">
              {tl("preview")}
            </Button>
          )}
        </div>
        {preview && !canPublish ? (
          <p className="text-end text-xs text-text-muted" data-testid="publish-forbidden">
            {tl("publishForbidden")}
          </p>
        ) : null}
      </form>
    </Card>
  );
}

/**
 * The preview itself: how many linked SKUs, the old and new rate, the rounding
 * rule applied, and each SKU's published price now → after, with the change.
 */
function LinkedPreviewPanel({
  preview,
  baseCode,
  money,
  stale,
}: {
  preview: Preview;
  baseCode: string;
  money: (value: number | null | undefined) => string;
  stale: boolean;
}) {
  const tl = useTranslations("linkedPrices");
  const locale = useLocale();
  const rounding = preview.rounding_multiple > 0
    ? tl("roundingMultiple", { multiple: money(preview.rounding_multiple) })
    : tl("roundingPrecision");
  const rate = (value: number | null) =>
    value === null ? tl("noPreviousRate") : rateText(preview.currency_code, baseCode, String(value), locale);

  return (
    <section
      className={`flex flex-col gap-3 rounded-md border p-4 ${stale ? "border-error/40 opacity-60" : "border-border"}`}
      data-testid="linked-preview"
      data-token={preview.preview_token}
      aria-live="polite"
    >
      <h3 className="font-bold">{tl("title")}</h3>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="text-text-muted">{tl("rateChange")}</dt>
          <dd dir="ltr" data-testid="preview-rates">
            {rate(preview.old_rate)} → {rate(preview.new_rate)}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-text-muted">{tl("count")}</dt>
          <dd data-testid="preview-count">{preview.linked_sku_count}</dd>
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <dt className="text-text-muted">{tl("rounding")}</dt>
          <dd data-testid="preview-rounding">{rounding}</dd>
        </div>
      </dl>
      {preview.items.length === 0 ? (
        <p className="text-sm text-text-muted" data-testid="preview-empty">
          {tl("empty")}
        </p>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm" data-testid="preview-table">
            <thead className="sticky top-0 bg-surface text-text-muted">
              <tr>
                <th className="py-1 text-start font-semibold">{tl("columns.sku")}</th>
                <th className="py-1 text-start font-semibold">{tl("columns.old")}</th>
                <th className="py-1 text-start font-semibold">{tl("columns.new")}</th>
                <th className="py-1 text-start font-semibold">{tl("columns.change")}</th>
              </tr>
            </thead>
            <tbody>
              {preview.items.map((item) => {
                const direction = changeDirection(item.percent_change);
                return (
                  <tr
                    key={item.variant_id}
                    className="border-t border-border"
                    data-testid="preview-row"
                    data-sku={item.sku}
                    data-direction={direction}
                    data-requires-approval={item.requires_below_cost_approval}
                  >
                    <td className="py-1.5">
                      <code dir="ltr">{item.sku}</code>
                      {item.requires_below_cost_approval ? (
                        <Badge tone="warning" className="ms-2" data-testid="preview-below-cost">
                          {tl("belowCostApproval")}
                        </Badge>
                      ) : null}
                    </td>
                    <td className="py-1.5" dir="ltr" data-testid="preview-old">
                      {money(item.old_price)}
                    </td>
                    <td className="py-1.5 font-semibold" dir="ltr" data-testid="preview-new">
                      {money(item.new_price)}
                    </td>
                    <td
                      className={`py-1.5 font-semibold ${direction === "down" ? "text-error-dark" : direction === "up" ? "text-success-dark" : "text-text-muted"}`}
                      dir="ltr"
                      data-testid="preview-change"
                    >
                      <span className="inline-flex items-center gap-1">
                        {direction === "up" ? <ArrowUp className="size-3.5" aria-hidden /> : null}
                        {direction === "down" ? <ArrowDown className="size-3.5" aria-hidden /> : null}
                        {direction === "new" ? tl("firstPrice") : formatPercentChange(item.percent_change)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
