"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Button, Card, Input, Select } from "@/components/ui";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { usePosting } from "@/components/finance/use-posting";
import { DocumentDateFields, documentDateError, type DocumentDateValue } from "@/components/purchasing/document-date";
import { PurchasingPostingStatus } from "@/components/purchasing/posting-status";
import { useCentralRate } from "@/components/purchasing/use-central-rate";
import { browserApi, unwrap } from "@/lib/api/client";
import { errorKind, type ErrorKind } from "@/lib/api/errors";
import { newOperationId } from "@/lib/finance/operations";
import type { CashAccountOption } from "@/lib/api/purchasing-server";
import {
  fixedText,
  moneyText,
  paymentPreview,
  precisionOf,
  settlementCurrency,
  settlingAmount,
  toFixed,
  type CurrencyCode,
  type PurchaseInvoice,
  type Supplier,
  type SupplierPayment,
} from "@/lib/purchasing";

export function PaymentForm({
  suppliers,
  cashAccounts,
  presetSupplierId,
  presetInvoiceId,
  permissions,
  today,
  windowDays,
}: {
  suppliers: Supplier[];
  cashAccounts: CashAccountOption[] | null;
  presetSupplierId: string;
  presetInvoiceId: string;
  permissions: string[];
  today: string;
  windowDays: number;
}) {
  const t = useTranslations("purchasing.payment");
  const locale = useLocale();
  const posting = usePosting<SupplierPayment & { journal_entry_id: string }>();
  const active = (cashAccounts ?? []).filter((account) => account.is_active);
  const [supplierId, setSupplierId] = useState(presetSupplierId);
  const [cashId, setCashId] = useState("");
  const cash = active.find((account) => account.id === cashId) ?? null;
  const currency: CurrencyCode = cash?.currency_code ?? "IQD";
  const [amount, setAmount] = useState("");
  /** A typed settlement rate; only with purchases.override_rate. */
  const [rate, setRate] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState<DocumentDateValue>({ date: today, backdateReason: "" });
  const [applied, setApplied] = useState<Record<string, string>>({});
  /** Bumped when "settle" fills a row, to remount its (uncontrolled) input. */
  const [filled, setFilled] = useState<Record<string, number>>({});
  const [invoices, setInvoices] = useState<{ key: string; rows: PurchaseInvoice[]; error: ErrorKind | null } | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [review, setReview] = useState<{ operationId: string } | null>(null);
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";
  const canOverride = permissions.includes("purchases.override_rate");

  // The supplier's invoices, read when the supplier changes.
  useEffect(() => {
    if (!supplierId) return;
    let cancelled = false;
    unwrap(browserApi.GET("/admin/purchase-invoices", { params: { query: { supplier_id: supplierId, per_page: 100 } } })).then(
      (page) => {
        if (!cancelled) setInvoices({ key: supplierId, rows: page.data as unknown as PurchaseInvoice[], error: null });
      },
      (cause: unknown) => {
        if (!cancelled) setInvoices({ key: supplierId, rows: [], error: errorKind(cause) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [supplierId]);

  const loaded = invoices?.key === supplierId ? invoices : null;
  // API 10.0.1: one payment may settle invoices in any currency. Every amount
  // typed here is in the cash account's currency; each allocation is
  // converted to its invoice's currency at the payment-date rate.
  const open = (loaded?.rows ?? []).filter((invoice) => toFixed(invoice.remaining_currency ?? 0) > 0n);
  const allocatedInvoices = open.filter((invoice) => toFixed(applied[invoice.id] || "0") > 0n);
  // The foreign currency on screen (for the rate shown per row) and the one
  // the allocations actually involve (what the server needs a rate for).
  const shownCurrency = settlementCurrency(currency, open.map((invoice) => invoice.currency_code)) ?? currency;
  const neededCurrency = settlementCurrency(currency, allocatedInvoices.map((invoice) => invoice.currency_code));
  const rateCurrency: CurrencyCode = neededCurrency && neededCurrency !== "IQD" ? neededCurrency : shownCurrency;
  const central = useCentralRate(rateCurrency, date.date, permissions.includes("fx_rates.view"));
  const overridden = canOverride && rateCurrency !== "IQD" && rate.trim() !== "";
  /** The rate the server will apply, when it can be known here. */
  const settlementRate: string | null = rateCurrency === "IQD" ? "1" : overridden ? rate.trim() : central.status === "ready" ? central.rate : null;
  const rateNeeded = neededCurrency !== null && neededCurrency !== "IQD";
  const missingRate = rateCurrency !== "IQD" && central.status === "missing" && !overridden;
  const ratesKnown = open.every((invoice) => invoice.exchange_rate !== undefined);

  const preview = paymentPreview({
    currency,
    amount: toFixed(amount || "0"),
    settlementRate: toFixed(settlementRate ?? "0"),
    allocations: allocatedInvoices.map((invoice) => ({
      invoiceId: invoice.id,
      invoiceCurrency: invoice.currency_code,
      bookedRate: toFixed(invoice.exchange_rate ?? 0),
      remaining: toFixed(invoice.remaining_currency ?? 0),
      amount: toFixed(applied[invoice.id] || "0"),
    })),
  });
  /** IQD figures need the settlement rate whenever a foreign currency is involved. */
  const iqdKnown = settlementRate !== null || (currency === "IQD" && !rateNeeded);

  const problems: string[] = [];
  if (!supplierId) problems.push(t("errors.supplier"));
  if (!cash) problems.push(t("errors.cash"));
  if (toFixed(amount || "0") <= 0n) problems.push(t("errors.amount"));
  if (neededCurrency === null) problems.push(t("errors.mixedCurrencies"));
  if (rateNeeded && missingRate) problems.push(t("errors.missingRate", { currency: rateCurrency }));
  if (overridden && toFixed(rate) <= 0n) problems.push(t("errors.rate"));
  if (settlementRate !== null) {
    for (const row of preview.rows) {
      const invoice = open.find((entry) => entry.id === row.invoiceId);
      if (row.overRemaining && invoice) problems.push(t("errors.overRemaining", { number: invoice.document_number }));
    }
  }
  if (preview.overAllocated) problems.push(t("errors.overAllocated"));
  if (documentDateError(date, today, windowDays, permissions.includes("backdate.approve"))) problems.push(t("errors.date"));

  function toReview() {
    setShowErrors(true);
    if (problems.length) return;
    posting.reset();
    setReview({ operationId: newOperationId() });
  }

  async function confirm() {
    if (!review || !cash) return;
    await posting.post(review.operationId, async () =>
      (await unwrap(
        browserApi.POST("/admin/supplier-payments", {
          body: {
            operation_id: review.operationId,
            document_date: date.date,
            ...(date.backdateReason.trim() ? { backdate_reason: date.backdateReason.trim() } : {}),
            supplier_id: supplierId,
            cash_account_id: cash.id,
            currency_code: currency,
            amount,
            // Without an override the server applies the payment-date rate itself.
            ...(rateNeeded && overridden ? { exchange_rate: rate.trim() } : {}),
            ...(reference.trim() ? { reference: reference.trim() } : {}),
            allocations: preview.rows.map((row) => ({ invoice_id: row.invoiceId, amount: fixedText(row.amount, precisionOf(currency)) })),
          },
        }),
      )) as unknown as SupplierPayment & { journal_entry_id: string },
    );
  }

  const money = (value: bigint, code: string) => moneyText(value, code, precisionOf(code), locale);
  const iqdMoney = (value: bigint) => (iqdKnown ? money(value, "IQD") : "—");
  const fxText = (value: bigint) =>
    value === 0n ? t("fxNone") : value > 0n ? t("fxLoss", { amount: money(value, "IQD") }) : t("fxGain", { amount: money(-value, "IQD") });
  const locked = review !== null;
  const posted = posting.state.phase === "posted" ? posting.state.document : null;

  if (cashAccounts === null) {
    return <Alert data-testid="payment-no-cash-accounts">{t("needsCashAccounts")}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6" data-testid="payment-form">
      <Card className="grid gap-4 md:grid-cols-3">
        <Field label={t("supplier")} name="supplier_id">
          <Select
            value={supplierId}
            disabled={locked}
            onChange={(event) => {
              setSupplierId(event.target.value);
              setApplied({});
            }}
            data-testid="payment-supplier"
          >
            <option value="">{t("pickSupplier")}</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name} · {supplier.default_currency}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("cashAccount")} name="cash_account_id">
          <Select
            value={cashId}
            disabled={locked}
            onChange={(event) => {
              setCashId(event.target.value);
              setApplied({});
              setRate("");
            }}
            data-testid="payment-cash"
          >
            <option value="">{t("pickCash")}</option>
            {active.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.currency_code}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("amountIn", { currency })} name="amount">
          <DecimalInput value={amount} parse={{ maxDecimals: precisionOf(currency) }} disabled={locked} onValueChange={(_, text) => setAmount(text.trim())} data-testid="payment-amount" />
        </Field>
        {rateCurrency !== "IQD" ? (
          <Field
            // Keyed by what resets the rate (currency, cash account) — never by
            // the day's rate loading, which must not remount the field and
            // drop a rate the user already typed (it arrives as a prefill).
            key={`rate-${rateCurrency}-${cashId}`}
            label={t("rate", { currency: rateCurrency })}
            name="exchange_rate"
            hint={
              central.status === "ready"
                ? canOverride
                  ? t("rateCentralEditable", { rate: central.rate })
                  : t("rateCentral", { rate: central.rate })
                : central.status === "hidden"
                  ? canOverride
                    ? t("rateHiddenEditable")
                    : t("rateHidden")
                  : central.status === "missing"
                    ? canOverride
                      ? t("rateMissingEditable")
                      : t("rateMissing")
                    : undefined
            }
          >
            <DecimalInput
              value={rate}
              prefill={central.status === "ready" ? central.rate : ""}
              parse={{ maxDecimals: 10 }}
              disabled={!canOverride || locked}
              onValueChange={(_, text) => setRate(text.trim())}
              data-testid="payment-rate"
            />
          </Field>
        ) : null}
        <DocumentDateFields value={date} onChange={setDate} today={today} windowDays={windowDays} canBackdate={permissions.includes("backdate.approve")} showErrors={showErrors} disabled={locked} testId="payment" />
        <Field label={t("reference")} name="reference">
          <Input value={reference} maxLength={160} disabled={locked} onChange={(event) => setReference(event.target.value)} />
        </Field>
      </Card>

      <Card className="flex flex-col gap-3 overflow-x-auto" data-testid="payment-allocations">
        <h2 className="text-lg font-bold">{t("allocations")}</h2>
        <p className="text-sm text-text-muted">{t("allocationsBody")}</p>
        {loaded?.error ? <FormError kind={loaded.error} /> : null}
        {supplierId && cash && open.length === 0 && loaded ? <p className="text-sm text-text-muted">{t("noOpenInvoices")}</p> : null}
        {rateCurrency !== "IQD" && central.status === "hidden" && !overridden ? (
          // Without the exchange-rate read permission there is no preview to
          // show; the server applies the payment-date rate when posting.
          <Alert tone="info" data-testid="payment-server-rate">
            {t("serverRate", { currency: rateCurrency })}
          </Alert>
        ) : null}
        {missingRate ? (
          <Alert data-testid="payment-missing-rate">
            <p>{t("missingRateBody", { currency: rateCurrency, date: date.date })}</p>
            <Link href="/finance/currencies" className="mt-1 inline-block font-semibold underline" data-testid="payment-missing-rate-link">
              {t("missingRateLink")}
            </Link>
          </Alert>
        ) : null}
        {!ratesKnown ? <Alert tone="info">{t("fxNeedsCost")}</Alert> : null}
        {open.length ? (
          <table className="w-full min-w-[64rem] text-sm">
            <thead className="text-text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">{t("columns.invoice")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.remaining")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.invoiceRate")}</th>
                <th className="w-48 px-3 py-2 text-start font-semibold">{t("columns.applyIn", { currency })}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.rateUsed")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.converted")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.carrying")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.paid")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.fx")}</th>
              </tr>
            </thead>
            <tbody>
              {open.map((invoice) => {
                const row = preview.rows.find((entry) => entry.invoiceId === invoice.id);
                const remaining = toFixed(invoice.remaining_currency ?? 0);
                const crossCurrency = invoice.currency_code !== currency;
                // An all-IQD allocation converts at 1; anything else needs the settlement rate.
                const rowRate = invoice.currency_code === "IQD" && currency === "IQD" ? null : settlementRate;
                const settle =
                  settlementRate !== null || (invoice.currency_code === "IQD" && currency === "IQD")
                    ? settlingAmount({
                        remaining,
                        invoiceCurrency: invoice.currency_code,
                        paymentCurrency: currency,
                        settlementRate: toFixed(settlementRate ?? "0"),
                        digits: precisionOf(currency),
                      })
                    : null;
                const booked = invoice.exchange_rate !== undefined;
                return (
                  <tr
                    key={invoice.id}
                    className="border-t border-border"
                    data-testid="payment-invoice"
                    data-number={invoice.document_number}
                    data-currency={invoice.currency_code}
                    data-cross={crossCurrency ? "true" : "false"}
                  >
                    <td className="px-3 py-2">
                      <Link href={`/purchasing/invoices/${invoice.id}`} className="font-semibold text-primary-dark hover:underline" dir="ltr">
                        {invoice.document_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-end" dir="ltr">{money(remaining, invoice.currency_code)}</td>
                    <td className="px-3 py-2 text-end" dir="ltr">{invoice.exchange_rate ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <DecimalInput
                          key={`${invoice.id}-${filled[invoice.id] ?? 0}`}
                          value={applied[invoice.id] ?? ""}
                          parse={{ maxDecimals: precisionOf(currency) }}
                          className="h-9"
                          disabled={locked}
                          onValueChange={(_, text) => setApplied((current) => ({ ...current, [invoice.id]: text.trim() }))}
                          data-testid="payment-apply"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={locked || settle === null || settle === 0n}
                          title={t("settleHint")}
                          onClick={() => {
                            setApplied((current) => ({ ...current, [invoice.id]: fixedText(settle ?? 0n, precisionOf(currency)) }));
                            setFilled((current) => ({ ...current, [invoice.id]: (current[invoice.id] ?? 0) + 1 }));
                          }}
                          data-testid="payment-settle"
                        >
                          {t("settle")}
                        </Button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-end" dir="ltr" data-testid="payment-row-rate">
                      {rowRate === null ? (invoice.currency_code === "IQD" && currency === "IQD" ? "—" : t("rateUnknown")) : rowRate}
                    </td>
                    <td className="px-3 py-2 text-end" dir="ltr" data-testid="payment-row-converted">
                      {row && (settlementRate !== null || !rateNeeded) ? money(row.applied, invoice.currency_code) : "—"}
                    </td>
                    <td className="px-3 py-2 text-end" dir="ltr">{row && booked ? iqdMoney(row.carryingIqd) : "—"}</td>
                    <td className="px-3 py-2 text-end" dir="ltr" data-testid="payment-row-paid">{row ? iqdMoney(row.paidIqd) : "—"}</td>
                    <td className="px-3 py-2 text-end" dir="ltr" data-testid="payment-row-fx">{row && booked && iqdKnown ? fxText(row.fxIqd) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" data-testid="payment-summary">
          <Tile label={t("summary.payment")} value={iqdMoney(preview.amountIqd)} />
          <Tile label={t("summary.allocated")} value={iqdMoney(preview.allocatedIqd)} />
          <Tile label={t("summary.fx")} value={ratesKnown && iqdKnown ? fxText(preview.fxIqd) : "—"} testId="payment-fx" />
          <Tile
            label={t("summary.credit")}
            value={preview.unallocatedIqd > 0n ? money(preview.creditCurrency, currency) : money(0n, currency)}
            testId="payment-credit"
          />
        </dl>
      </Card>

      {showErrors && problems.length ? (
        <Alert data-testid="payment-problems">
          <ul className="list-inside list-disc">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {review ? (
        <Card className="flex flex-col gap-3" data-testid="payment-review">
          <p className="text-sm" data-testid="payment-review-body">
            {ratesKnown && iqdKnown
              ? t("reviewBody", { amount: money(toFixed(amount || "0"), currency), fx: fxText(preview.fxIqd) })
              : t("reviewBodyServerRate", { amount: money(toFixed(amount || "0"), currency) })}
          </p>
          <PurchasingPostingStatus state={posting.state} onRetry={() => void confirm()} onCheck={() => void posting.check(review.operationId)} />
          {posted ? (
            <p className="text-sm" data-testid="payment-posted">
              {t("postedSummary", {
                fx: fxText((posted.allocations ?? []).reduce((sum, row) => sum + toFixed(row.fx_difference_iqd), 0n)),
                credit: money(toFixed(posted.unallocated_currency), posted.currency_code),
              })}
            </p>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReview(null)} disabled={busy}>
                {t("edit")}
              </Button>
              <Button onClick={() => void confirm()} pending={busy} disabled={posting.state.phase === "notPosted" || posting.state.phase === "processing"} data-testid="payment-confirm">
                {t("confirm")}
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="flex justify-end">
          <Button onClick={toReview} data-testid="payment-review-button">
            {t("review")}
          </Button>
        </div>
      )}
      {presetInvoiceId && !applied[presetInvoiceId] && open.some((invoice) => invoice.id === presetInvoiceId) && !locked ? (
        <p className="text-xs text-text-muted">{t("presetHint")}</p>
      ) : null}
    </div>
  );
}

function Tile({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-md bg-card p-3">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="font-bold" dir="ltr" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
