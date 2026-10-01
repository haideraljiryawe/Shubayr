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
  const [rate, setRate] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState<DocumentDateValue>({ date: today, backdateReason: "" });
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [invoices, setInvoices] = useState<{ key: string; rows: PurchaseInvoice[]; error: ErrorKind | null } | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [review, setReview] = useState<{ operationId: string } | null>(null);
  const central = useCentralRate(currency, date.date, permissions.includes("ledger.view"));
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";

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
  const open = (loaded?.rows ?? []).filter((invoice) => toFixed(invoice.remaining_currency ?? 0) > 0n);
  // A payment settles invoices in its own currency (see the PR notes on mixed currencies).
  const eligible = open.filter((invoice) => invoice.currency_code === currency);
  const settlementRate = currency === "IQD" ? "1" : rate.trim() || (central.status === "ready" ? central.rate : "");
  const ratesKnown = eligible.every((invoice) => invoice.exchange_rate !== undefined);

  const preview = paymentPreview({
        currency,
        amount: toFixed(amount || "0"),
        settlementRate: toFixed(settlementRate || "0"),
        allocations: eligible
          .filter((invoice) => toFixed(applied[invoice.id] || "0") > 0n)
          .map((invoice) => ({
            invoiceId: invoice.id,
            invoiceCurrency: invoice.currency_code,
            invoiceRate: toFixed(invoice.exchange_rate ?? 0),
            applied: toFixed(applied[invoice.id] || "0"),
          })),
  });

  const problems: string[] = [];
  if (!supplierId) problems.push(t("errors.supplier"));
  if (!cash) problems.push(t("errors.cash"));
  if (toFixed(amount || "0") <= 0n) problems.push(t("errors.amount"));
  if (currency !== "IQD" && toFixed(settlementRate || "0") <= 0n) problems.push(t("errors.rate"));
  for (const invoice of eligible) {
    const value = toFixed(applied[invoice.id] || "0");
    if (value < 0n || value > toFixed(invoice.remaining_currency ?? 0)) problems.push(t("errors.overRemaining", { number: invoice.document_number }));
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
            ...(currency !== "IQD" ? { exchange_rate: settlementRate } : {}),
            ...(reference.trim() ? { reference: reference.trim() } : {}),
            allocations: preview.rows.map((row) => ({ invoice_id: row.invoiceId, amount: fixedText(row.applied, 6) })),
          },
        }),
      )) as unknown as SupplierPayment & { journal_entry_id: string },
    );
  }

  const money = (value: bigint, code: string) => moneyText(value, code, precisionOf(code), locale);
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
        {currency !== "IQD" ? (
          <Field
            key={`rate-${central.status}-${currency}`}
            label={t("rate", { currency })}
            name="exchange_rate"
            hint={central.status === "ready" ? t("rateCentral", { rate: central.rate }) : central.status === "hidden" ? t("rateHidden") : t("rateMissing")}
          >
            <DecimalInput value={rate || (central.status === "ready" ? central.rate : "")} parse={{ maxDecimals: 10 }} disabled={locked} onValueChange={(_, text) => setRate(text.trim())} data-testid="payment-rate" />
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
        {supplierId && cash && eligible.length === 0 && loaded ? <p className="text-sm text-text-muted">{t("noOpenInvoices", { currency })}</p> : null}
        {open.length > eligible.length ? <p className="text-xs text-text-muted">{t("otherCurrencyInvoices")}</p> : null}
        {!ratesKnown ? <Alert tone="info">{t("fxNeedsCost")}</Alert> : null}
        {eligible.length ? (
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="text-text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">{t("columns.invoice")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.remaining")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.invoiceRate")}</th>
                <th className="w-40 px-3 py-2 text-start font-semibold">{t("columns.apply")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.carrying")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.paid")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.fx")}</th>
              </tr>
            </thead>
            <tbody>
              {eligible.map((invoice) => {
                const row = preview.rows.find((entry) => entry.invoiceId === invoice.id);
                return (
                  <tr key={invoice.id} className="border-t border-border" data-testid="payment-invoice" data-number={invoice.document_number}>
                    <td className="px-3 py-2">
                      <Link href={`/purchasing/invoices/${invoice.id}`} className="font-semibold text-primary-dark hover:underline" dir="ltr">
                        {invoice.document_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-end" dir="ltr">{money(toFixed(invoice.remaining_currency ?? 0), invoice.currency_code)}</td>
                    <td className="px-3 py-2 text-end" dir="ltr">{invoice.exchange_rate ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <DecimalInput
                          value={applied[invoice.id] ?? ""}
                          parse={{ maxDecimals: precisionOf(currency) }}
                          className="h-9"
                          disabled={locked}
                          onValueChange={(_, text) => setApplied((current) => ({ ...current, [invoice.id]: text.trim() }))}
                          data-testid="payment-apply"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-end" dir="ltr">{row ? money(row.carryingIqd, "IQD") : "—"}</td>
                    <td className="px-3 py-2 text-end" dir="ltr">{row ? money(row.paidIqd, "IQD") : "—"}</td>
                    <td className="px-3 py-2 text-end" dir="ltr" data-testid="payment-row-fx">{row ? fxText(row.fxIqd) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" data-testid="payment-summary">
          <Tile label={t("summary.payment")} value={money(preview.amountIqd, "IQD")} />
          <Tile label={t("summary.allocated")} value={money(preview.allocatedIqd, "IQD")} />
          <Tile label={t("summary.fx")} value={fxText(preview.fxIqd)} testId="payment-fx" />
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
          <p className="text-sm">{t("reviewBody", { amount: money(toFixed(amount || "0"), currency), fx: fxText(preview.fxIqd) })}</p>
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
      {presetInvoiceId && !applied[presetInvoiceId] && eligible.some((invoice) => invoice.id === presetInvoiceId) && !locked ? (
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
