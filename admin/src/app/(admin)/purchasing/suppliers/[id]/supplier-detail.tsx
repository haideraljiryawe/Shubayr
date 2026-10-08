"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Alert, Badge, Button, Card, Input, Select } from "@/components/ui";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Field } from "@/components/forms/field";
import { TableFilter } from "@/components/table/data-table";
import { usePosting } from "@/components/finance/use-posting";
import { DocumentDateFields, documentDateError, type DocumentDateValue } from "@/components/purchasing/document-date";
import { PurchasingPostingStatus } from "@/components/purchasing/posting-status";
import { SupplierDialog } from "@/components/purchasing/supplier-dialog";
import { useCentralRate } from "@/components/purchasing/use-central-rate";
import { browserApi, unwrap } from "@/lib/api/client";
import { newOperationId } from "@/lib/finance/operations";
import {
  fx,
  moneyText,
  precisionOf,
  purchasingSourceHref,
  toFixed,
  type CurrencyCode,
  type PurchaseInvoice,
  type StatementLine,
  type Supplier,
  type SupplierCredit,
} from "@/lib/purchasing";

export function SupplierDetail({
  supplier,
  statement,
  credits,
  invoices,
  filters,
  permissions,
  today,
  windowDays,
}: {
  supplier: Supplier;
  statement: StatementLine[] | null;
  credits: SupplierCredit[];
  invoices: PurchaseInvoice[];
  filters: { asOf: string; currency: string };
  permissions: string[];
  today: string;
  windowDays: number;
}) {
  const t = useTranslations("purchasing.supplier");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const can = (key: string) => permissions.includes(key);

  return (
    <div className="flex flex-col gap-6" data-testid="supplier-detail">
      <Card className="flex flex-wrap items-start justify-between gap-4">
        <dl className="grid flex-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Item label={t("currency")} value={<span dir="ltr">{supplier.default_currency}</span>} />
          <Item label={t("terms")} value={t("termsDays", { days: supplier.payment_terms_days })} />
          <Item label={t("phone")} value={<span dir="ltr">{supplier.phone ?? "—"}</span>} />
          <Item label={t("email")} value={<span dir="ltr">{supplier.email ?? "—"}</span>} />
          <Item label={t("address")} value={supplier.address ?? "—"} />
          <Item
            label={t("status")}
            value={<Badge tone={supplier.is_active ? "success" : "neutral"}>{supplier.is_active ? t("active") : t("inactive")}</Badge>}
          />
          {supplier.notes ? <Item label={t("notes")} value={supplier.notes} /> : null}
        </dl>
        <div className="flex flex-wrap gap-2">
          {can("suppliers.manage") ? (
            <Button variant="secondary" onClick={() => setEditing(true)} data-testid="supplier-edit">
              {t("edit")}
            </Button>
          ) : null}
          {can("purchases.create") && supplier.is_active ? (
            <Link href={`/purchasing/invoices/new?supplier_id=${supplier.id}`} className="inline-flex h-11 items-center rounded-md bg-primary-dark px-5 text-sm font-semibold text-on-primary" data-testid="supplier-new-invoice">
              {t("newInvoice")}
            </Link>
          ) : null}
          {can("supplier_payments.record") ? (
            <Link href={`/purchasing/payments/new?supplier_id=${supplier.id}`} className="inline-flex h-11 items-center rounded-md border border-primary px-5 text-sm font-semibold text-primary-dark" data-testid="supplier-pay">
              {t("pay")}
            </Link>
          ) : null}
        </div>
      </Card>

      {editing ? (
        <SupplierDialog
          supplier={supplier}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      ) : null}

      <StatementCard statement={statement} filters={filters} supplier={supplier} />

      <InvoicesCard invoices={invoices} />

      <CreditsCard
        credits={credits}
        invoices={invoices}
        canAllocate={can("supplier_credits.allocate")}
        onPosted={() => router.refresh()}
      />

      {can("supplier_openings.record") ? (
        <OpeningBalanceCard
          supplier={supplier}
          today={today}
          windowDays={windowDays}
          canBackdate={can("backdate.approve")}
          canReadRate={can("fx_rates.view")}
          onPosted={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/* --------------------------------------------------------------- statement */

function StatementCard({ statement, filters, supplier }: { statement: StatementLine[] | null; filters: { asOf: string; currency: string }; supplier: Supplier }) {
  const t = useTranslations("purchasing.supplier");
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const day = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", numberingSystem: "latn", timeZone: "UTC" });
  const money = (value: number, currency: string) => moneyText(toFixed(value), currency, precisionOf(currency), locale);

  return (
    <Card className="flex flex-col gap-4 overflow-x-auto" data-testid="supplier-statement">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-bold">{t("statement")}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <TableFilter
            name="currency"
            label={t("statementCurrency")}
            options={[
              { value: "", label: t("allCurrencies") },
              { value: "IQD", label: "IQD" },
              { value: "USD", label: "USD" },
            ]}
          />
          <label className="flex flex-col gap-1 text-sm font-semibold">
            <span>{t("asOf")}</span>
            <Input
              type="date"
              className="w-44"
              defaultValue={filters.asOf}
              onChange={(event) => {
                const params = new URLSearchParams(window.location.search);
                if (event.target.value) params.set("as_of", event.target.value);
                else params.delete("as_of");
                router.push(`/purchasing/suppliers/${supplier.id}?${params}`, { scroll: false });
              }}
              data-testid="statement-as-of"
            />
          </label>
        </div>
      </div>
      {statement === null ? (
        <p className="text-sm text-text-muted">{t("statementUnavailable")}</p>
      ) : statement.length === 0 ? (
        <p className="text-sm text-text-muted">{t("statementEmpty")}</p>
      ) : (
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="text-text-muted">
            <tr>
              <th className="px-3 py-2 text-start font-semibold">{t("columns.date")}</th>
              <th className="px-3 py-2 text-start font-semibold">{t("columns.document")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("columns.debit")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("columns.credit")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("columns.balance")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("columns.balanceIqd")}</th>
            </tr>
          </thead>
          <tbody>
            {statement.map((line) => {
              const href = purchasingSourceHref(line.source_type, line.purchase_invoice_id ?? line.source_id);
              return (
                <tr key={line.id} className="border-t border-border" data-testid="statement-line" data-source={line.source_type}>
                  <td className="px-3 py-2 whitespace-nowrap">{day(line.document_date)}</td>
                  <td className="px-3 py-2">
                    {href ? (
                      <Link href={href} className="font-semibold text-primary-dark hover:underline" dir="ltr">
                        {line.document_number}
                      </Link>
                    ) : (
                      <span dir="ltr">{line.document_number}</span>
                    )}
                    <span className="block text-xs text-text-muted">{t.has(`source.${line.source_type}`) ? t(`source.${line.source_type}`) : line.source_type}</span>
                  </td>
                  <td className="px-3 py-2 text-end" dir="ltr">{line.debit_currency ? money(line.debit_currency, line.currency_code) : "—"}</td>
                  <td className="px-3 py-2 text-end" dir="ltr">{line.credit_currency ? money(line.credit_currency, line.currency_code) : "—"}</td>
                  <td className="px-3 py-2 text-end font-semibold" dir="ltr" data-testid="statement-balance">
                    {money(line.running_balance_currency, line.currency_code)}
                  </td>
                  <td className="px-3 py-2 text-end text-text-muted" dir="ltr" data-testid="statement-balance-iqd">
                    {money(line.running_balance_iqd, "IQD")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- invoices */

function InvoicesCard({ invoices }: { invoices: PurchaseInvoice[] }) {
  const t = useTranslations("purchasing.supplier");
  const locale = useLocale();
  return (
    <Card className="flex flex-col gap-3 overflow-x-auto">
      <h2 className="text-lg font-bold">{t("invoices")}</h2>
      {invoices.length === 0 ? (
        <p className="text-sm text-text-muted">{t("noInvoices")}</p>
      ) : (
        <table className="w-full min-w-[36rem] text-sm">
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-t border-border first:border-t-0">
                <td className="px-3 py-2">
                  <Link href={`/purchasing/invoices/${invoice.id}`} className="font-semibold text-primary-dark hover:underline" dir="ltr">
                    {invoice.document_number}
                  </Link>
                  {invoice.invoice_number ? <span className="ms-2 text-xs text-text-muted" dir="ltr">{invoice.invoice_number}</span> : null}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={invoice.settlement_status === "paid" ? "success" : invoice.settlement_status === "partial" ? "warning" : "info"}>
                    {t(`settlement.${invoice.settlement_status ?? "open"}`)}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-end" dir="ltr">
                  {invoice.remaining_currency !== undefined
                    ? moneyText(toFixed(invoice.remaining_currency), invoice.currency_code, precisionOf(invoice.currency_code), locale)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------------- credits */

function CreditsCard({
  credits,
  invoices,
  canAllocate,
  onPosted,
}: {
  credits: SupplierCredit[];
  invoices: PurchaseInvoice[];
  canAllocate: boolean;
  onPosted: () => void;
}) {
  const t = useTranslations("purchasing.supplier");
  const locale = useLocale();
  const [allocating, setAllocating] = useState<SupplierCredit | null>(null);
  const open = credits.filter((credit) => toFixed(credit.remaining_currency) > 0n);

  return (
    <Card className="flex flex-col gap-3" data-testid="supplier-credits">
      <h2 className="text-lg font-bold">{t("credits")}</h2>
      {open.length === 0 ? (
        <p className="text-sm text-text-muted">{t("noCredits")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {open.map((credit) => (
            <li key={credit.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card px-3 py-2 text-sm" data-testid="supplier-credit">
              <span>
                {t(`creditSource.${credit.source_type === "return" ? "return" : "payment"}`)} ·{" "}
                <span className="font-semibold" dir="ltr" data-testid="supplier-credit-remaining">
                  {moneyText(toFixed(credit.remaining_currency), credit.currency_code, precisionOf(credit.currency_code), locale)}
                </span>
              </span>
              {canAllocate ? (
                <Button size="sm" variant="secondary" onClick={() => setAllocating(credit)} data-testid="credit-allocate">
                  {t("applyCredit")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {allocating ? (
        <AllocateCredit
          key={allocating.id}
          credit={allocating}
          invoices={invoices.filter((invoice) => invoice.currency_code === allocating.currency_code && toFixed(invoice.remaining_currency ?? 0) > 0n)}
          onClose={() => setAllocating(null)}
          onPosted={onPosted}
        />
      ) : null}
    </Card>
  );
}

function AllocateCredit({
  credit,
  invoices,
  onClose,
  onPosted,
}: {
  credit: SupplierCredit;
  invoices: PurchaseInvoice[];
  onClose: () => void;
  onPosted: () => void;
}) {
  const t = useTranslations("purchasing.supplier");
  const posting = usePosting<{ id: string; document_number: string }>();
  const [operationId] = useState(newOperationId);
  const [invoiceId, setInvoiceId] = useState(invoices[0]?.id ?? "");
  const [amount, setAmount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const invoice = invoices.find((row) => row.id === invoiceId);
  const limit = invoice ? (toFixed(invoice.remaining_currency ?? 0) < toFixed(credit.remaining_currency) ? invoice.remaining_currency ?? 0 : credit.remaining_currency) : 0;

  async function submit() {
    if (!invoice) return setError(t("errors.pickInvoice"));
    if (!amount || toFixed(amount) <= 0n) return setError(t("errors.amount"));
    if (toFixed(amount) > toFixed(limit)) return setError(t("errors.overLimit"));
    setError(null);
    const state = await posting.post(operationId, async () => {
      await unwrap(
        browserApi.POST("/admin/supplier-credits/{id}/allocations", {
          params: { path: { id: credit.id } },
          body: { operation_id: operationId, invoice_id: invoice.id, amount },
        }),
      );
      return { id: credit.id, document_number: invoice.document_number };
    });
    if (state?.phase === "posted") onPosted();
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4" data-testid="credit-allocation-form">
      {invoices.length === 0 ? (
        <Alert tone="info">{t("noOpenInvoices")}</Alert>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t("invoice")} name="invoice_id">
            <Select value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)} data-testid="credit-invoice">
              {invoices.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.document_number}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("amountIn", { currency: credit.currency_code })} name="amount" error={error} hint={t("upTo", { value: String(limit) })}>
            <DecimalInput value="" parse={{ maxDecimals: 6 }} onValueChange={setAmount} data-testid="credit-amount" />
          </Field>
        </div>
      )}
      <PurchasingPostingStatus state={posting.state} onRetry={() => void submit()} onCheck={() => void posting.check(operationId)} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {posting.state.phase === "posted" ? t("close") : t("cancel")}
        </Button>
        {posting.state.phase === "posted" || invoices.length === 0 ? null : (
          <Button onClick={() => void submit()} pending={posting.state.phase === "posting"} data-testid="credit-allocate-submit">
            {t("applyCredit")}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- opening balance */

function OpeningBalanceCard({
  supplier,
  today,
  windowDays,
  canBackdate,
  canReadRate,
  onPosted,
}: {
  supplier: Supplier;
  today: string;
  windowDays: number;
  canBackdate: boolean;
  canReadRate: boolean;
  onPosted: () => void;
}) {
  const t = useTranslations("purchasing.supplier");
  const locale = useLocale();
  const posting = usePosting<{ id: string; document_number: string; journal_entry_id: string }>();
  const [currency, setCurrency] = useState<CurrencyCode>(supplier.default_currency);
  const [amount, setAmount] = useState<string | null>(null);
  const [rate, setRate] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [date, setDate] = useState<DocumentDateValue>({ date: today, backdateReason: "" });
  const [review, setReview] = useState<{ operationId: string; rate: string } | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const central = useCentralRate(currency, date.date, canReadRate);
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";
  const effectiveRate = currency === "IQD" ? "1" : rate ?? (central.status === "ready" ? central.rate : null);

  function toReview() {
    setShowErrors(true);
    const found: Record<string, string> = {};
    if (!amount || toFixed(amount) <= 0n) found.amount = t("errors.amount");
    if (!effectiveRate || toFixed(effectiveRate) <= 0n) found.exchange_rate = t("errors.rate");
    setErrors(found);
    if (Object.keys(found).length || documentDateError(date, today, windowDays, canBackdate) || !effectiveRate) return;
    posting.reset();
    setReview({ operationId: newOperationId(), rate: effectiveRate });
  }

  async function confirm() {
    if (!review || !amount) return;
    const state = await posting.post(review.operationId, () =>
      unwrap(
        browserApi.POST("/admin/suppliers/{id}/opening-balance", {
          params: { path: { id: supplier.id } },
          body: {
            operation_id: review.operationId,
            document_date: date.date,
            ...(date.backdateReason.trim() ? { backdate_reason: date.backdateReason.trim() } : {}),
            currency_code: currency,
            amount,
            exchange_rate: review.rate,
            ...(dueDate ? { due_date: dueDate } : {}),
          },
        }),
      ) as Promise<{ id: string; document_number: string; journal_entry_id: string }>,
    );
    if (state?.phase === "posted") onPosted();
  }

  return (
    <Card className="flex flex-col gap-4" data-testid="supplier-opening">
      <div>
        <h2 className="text-lg font-bold">{t("opening")}</h2>
        <p className="text-sm text-text-muted">{t("openingBody")}</p>
      </div>
      {review ? (
        <>
          <p className="text-sm" data-testid="opening-preview">
            {t("openingPreview", {
              amount: moneyText(toFixed(amount ?? "0"), currency, precisionOf(currency), locale),
              iqd: moneyText(fx.mul(toFixed(amount ?? "0"), toFixed(review.rate)), "IQD", 0, locale),
              date: date.date,
            })}
          </p>
          <PurchasingPostingStatus state={posting.state} onRetry={() => void confirm()} onCheck={() => void posting.check(review.operationId)} />
          <div className="flex justify-end gap-2">
            {posting.state.phase === "posted" ? null : (
              <>
                <Button variant="ghost" onClick={() => setReview(null)} disabled={busy}>
                  {t("edit")}
                </Button>
                <Button onClick={() => void confirm()} pending={busy} disabled={posting.state.phase === "notPosted" || posting.state.phase === "processing"} data-testid="opening-confirm">
                  {t("postOpening")}
                </Button>
              </>
            )}
          </div>
        </>
      ) : (
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            toReview();
          }}
        >
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t("currency")} name="currency_code">
              <Select value={currency} onChange={(event) => { setCurrency(event.target.value as CurrencyCode); setRate(null); }} data-testid="opening-currency">
                <option value="IQD">IQD</option>
                <option value="USD">USD</option>
              </Select>
            </Field>
            <Field label={t("amountIn", { currency })} name="amount" error={errors.amount}>
              <DecimalInput value="" parse={{ maxDecimals: currency === "IQD" ? 0 : 2 }} onValueChange={setAmount} data-testid="opening-amount" />
            </Field>
            {currency === "USD" ? (
              <Field
                label={t("rate")}
                name="exchange_rate"
                error={errors.exchange_rate}
                hint={central.status === "ready" ? t("rateCentral", { rate: central.rate }) : central.status === "hidden" ? t("rateHidden") : central.status === "missing" ? t("rateMissing") : undefined}
              >
                <DecimalInput value="" prefill={central.status === "ready" ? central.rate : ""} parse={{ maxDecimals: 10 }} onValueChange={setRate} data-testid="opening-rate" />
              </Field>
            ) : null}
            <DocumentDateFields value={date} onChange={setDate} today={today} windowDays={windowDays} canBackdate={canBackdate} showErrors={showErrors} testId="opening" />
            <Field label={t("dueDate")} name="due_date" hint={t("dueDateHint")}>
              <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" data-testid="opening-review">
              {t("review")}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
