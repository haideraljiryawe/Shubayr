"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Button, Card, FilePicker, Input, Select, Textarea, ActionBar } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { DocumentDateFields } from "@/components/purchasing/document-date";
import { useCentralRate } from "@/components/purchasing/use-central-rate";
import { browserApi, unwrap } from "@/lib/api/client";
import { errorKind } from "@/lib/api/errors";
import type { CurrencyChoice } from "@/lib/api/expenses-server";
import { OperationKey } from "@/lib/finance/cash-receipts";
import { postFile } from "@/lib/file-upload";
import { moneyText, toFixed, type CurrencyCode } from "@/lib/purchasing";
import {
  RECEIPT_MAX_BYTES,
  RECEIPT_TYPES,
  accountsFor,
  expenseBody,
  expenseHref,
  expenseRefusal,
  newIdempotencyKey,
  parseAmount,
  validateExpense,
  type CashAccountChoice,
  type Expense,
  type ExpenseCategory,
  type ExpenseForm as Form,
  type ExpenseFormProblem,
} from "@/lib/expenses";
import { ExpenseRefusalNotice } from "../refusal";
import { AmountInput } from "@/components/forms/amount-input";

interface Receipt {
  id: string;
  name: string;
  mime: string;
}

export function ExpenseForm({
  categories,
  cashAccounts,
  currencies,
  suppliers,
  today,
  windowDays,
  canBackdate,
  canReadRates,
}: {
  categories: ExpenseCategory[];
  cashAccounts: CashAccountChoice[] | null;
  currencies: CurrencyChoice[];
  suppliers: Array<{ id: string; name: string }> | null;
  today: string;
  windowDays: number;
  canBackdate: boolean;
  canReadRates: boolean;
}) {
  const t = useTranslations("expenses.form");
  const tm = useTranslations("expenses");
  const locale = useLocale();
  const router = useRouter();
  const base = currencies.find((currency) => currency.isBase)?.code ?? "IQD";
  const [form, setForm] = useState<Form>({
    documentDate: today,
    backdateReason: "",
    categoryId: "",
    amount: "",
    currency: base,
    payeeKind: "text",
    payee: "",
    supplierId: "",
    description: "",
    referenceNumber: "",
    receiptId: "",
    paymentMode: "paid_now",
    cashAccountId: "",
  });
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [upload, setUpload] = useState<{ percent: number } | { error: string } | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const key = useRef(new OperationKey(newIdempotencyKey));

  const precision = currencies.find((currency) => currency.code === form.currency)?.precision ?? 0;
  const problems = validateExpense(form, { precision, cashAccounts, today, windowDays, canBackdate });
  const problem = <F extends ExpenseFormProblem["field"]>(field: F) =>
    attempted ? (problems.find((entry) => entry.field === field)?.problem ?? null) : null;
  const rate = useCentralRate(form.currency as CurrencyCode, form.documentDate, canReadRates);
  const amount = parseAmount(form.amount, precision);
  const accounts = cashAccounts ? accountsFor(form.currency, cashAccounts) : [];
  const name = (category: ExpenseCategory) => (locale === "ar" ? category.name_ar : category.name_en) || category.name_ar;
  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));

  async function attach(file: File | undefined) {
    if (!file) return;
    if (!(RECEIPT_TYPES as readonly string[]).includes(file.type)) return setUpload({ error: t("receiptType") });
    if (file.size > RECEIPT_MAX_BYTES) return setUpload({ error: t("receiptSize") });
    setUpload({ percent: 0 });
    try {
      const uploaded = await postFile<{ id: string; mime_type: string }>("/api/expense-receipts", file, file.name, {
        onProgress: (percent) => setUpload({ percent }),
      });
      setReceipt({ id: uploaded.id, name: file.name, mime: uploaded.mime_type });
      set({ receiptId: uploaded.id });
      setUpload(null);
    } catch (error) {
      setUpload({ error: expenseRefusal(error) ? tm(`refusals.${expenseRefusal(error)}`) : t("receiptFailed") });
    }
  }

  async function save() {
    if (pending) return;
    setAttempted(true);
    setFailure(null);
    if (problems.length) return;
    const body = expenseBody(form, precision, today);
    // One key per distinct request: a retry of this exact draft is answered
    // once; any change makes a new one.
    const idempotencyKey = key.current.id(JSON.stringify(body));
    setPending(true);
    try {
      const created: Expense = await unwrap(
        browserApi.POST("/admin/expenses", { params: { header: { "Idempotency-Key": idempotencyKey } }, body }),
      );
      router.push(expenseHref(created.id));
    } catch (error) {
      setFailure(error);
      setPending(false);
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      data-testid="expense-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {!categories.length ? <Alert data-testid="expense-no-categories">{t("noCategories")}</Alert> : null}
      <Card className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <DocumentDateFields
            value={{ date: form.documentDate, backdateReason: form.backdateReason }}
            onChange={(value) => set({ documentDate: value.date, backdateReason: value.backdateReason })}
            today={today}
            windowDays={windowDays}
            canBackdate={canBackdate}
            showErrors={attempted}
            disabled={pending}
            testId="expense-date"
          />
          <Field label={t("category")} error={problem("categoryId") ? t("problems.required") : null}>
            <Select value={form.categoryId} disabled={pending} onValueChange={(value) => set({ categoryId: value })} data-testid="expense-category">
              <option value="">{t("choose")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {name(category)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t("amount")} error={problem("amount") ? t(`problems.amount.${problem("amount")}`, { digits: precision }) : null}>
            <AmountInput value={form.amount} disabled={pending} onValueChange={(value) => set({ amount: value })} data-testid="expense-amount" />
          </Field>
          <Field label={t("currency")}>
            <Select value={form.currency} disabled={pending} onValueChange={(value) => set({ currency: value, cashAccountId: "" })} data-testid="expense-currency">
              {currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col justify-end text-body" data-testid="expense-rate">
            {form.currency === base ? null : rate.status === "ready" ? (
              <p>
                {t("rate", { rate: rate.rate, currency: form.currency })}
                {amount.ok ? (
                  <span className="block font-semibold" dir="ltr" data-testid="expense-rate-iqd">
                    ≈ {moneyText(toFixed(String(Number(amount.value) * Number(rate.rate))), "IQD", 0, locale)}
                  </span>
                ) : null}
              </p>
            ) : rate.status === "missing" ? (
              <p className="text-error-dark" data-testid="expense-rate-missing">{t("rateMissing", { currency: form.currency })}</p>
            ) : rate.status === "hidden" ? (
              <p className="text-text-muted">{t("rateHidden")}</p>
            ) : (
              <p className="text-text-muted">{t("rateLoading")}</p>
            )}
          </div>
        </div>

        <fieldset className="flex flex-col gap-2" disabled={pending}>
          <legend className="mb-1 text-label">{t("payee")}</legend>
          {suppliers ? (
            <div className="flex flex-wrap gap-4 text-body">
              {(["text", "supplier"] as const).map((kind) => (
                <label key={kind} className="flex items-center gap-2">
                  <input type="radio" name="payee-kind" checked={form.payeeKind === kind} onChange={() => set({ payeeKind: kind })} data-testid={`expense-payee-${kind}`} />
                  {t(`payeeKinds.${kind}`)}
                </label>
              ))}
            </div>
          ) : null}
          {form.payeeKind === "supplier" && suppliers ? (
            <Field label={<span className="sr-only">{t("supplier")}</span>} error={problem("supplierId") ? t("problems.required") : null}>
              <Select value={form.supplierId} onValueChange={(value) => set({ supplierId: value })} data-testid="expense-supplier">
                <option value="">{t("chooseSupplier")}</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label={<span className="sr-only">{t("payee")}</span>} hint={t("payeeHint")} error={problem("payee") ? t("problems.required") : null}>
              <Input maxLength={200} value={form.payee} onChange={(event) => set({ payee: event.target.value })} data-testid="expense-payee" />
            </Field>
          )}
        </fieldset>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("description")} error={problem("description") ? t(`problems.${problem("description")}`, { max: 2000 }) : null}>
            <Textarea rows={2} maxLength={2000} value={form.description} disabled={pending} onChange={(event) => set({ description: event.target.value })} data-testid="expense-description" />
          </Field>
          <Field label={t("reference")} hint={t("referenceHint")} error={problem("referenceNumber") ? t("problems.tooLong", { max: 160 }) : null}>
            <Input maxLength={160} dir="auto" value={form.referenceNumber} disabled={pending} onChange={(event) => set({ referenceNumber: event.target.value })} data-testid="expense-reference" />
          </Field>
        </div>

        <Field label={t("receipt")} hint={t("receiptHint")} error={upload && "error" in upload ? upload.error : null}>
          <FilePicker
            accept={RECEIPT_TYPES.join(",")}
            disabled={pending || Boolean(upload && "percent" in upload)}
            selected={receipt}
            onFiles={(files) => void attach(files[0])}
            data-testid="expense-receipt"
          />
        </Field>
        {upload && "percent" in upload ? <p className="text-body text-text-muted" data-testid="expense-receipt-progress">{t("uploading", { percent: upload.percent })}</p> : null}
        {receipt ? (
          <p className="flex items-center gap-3 text-body" data-testid="expense-receipt-ready">
            {t("receiptAttached", { name: receipt.name })}
            <button
              type="button"
              className="font-semibold text-primary-dark hover:underline"
              onClick={() => {
                setReceipt(null);
                set({ receiptId: "" });
              }}
            >
              {t("receiptRemove")}
            </button>
          </p>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-2 text-body" disabled={pending}>
          <legend className="mb-1 font-semibold">{t("paymentMode")}</legend>
          {(["paid_now", "owed"] as const).map((mode) => (
            <label key={mode} className="flex items-start gap-2">
              <input type="radio" name="payment-mode" checked={form.paymentMode === mode} onChange={() => set({ paymentMode: mode, cashAccountId: "" })} data-testid={`expense-mode-${mode}`} />
              <span>
                {tm(`modes.${mode}`)}
                <span className="block text-caption text-text-muted">{t(`modeHints.${mode}`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {form.paymentMode === "paid_now" ? (
          cashAccounts === null ? (
            <Alert data-testid="expense-no-accounts">{t("cashAccountsForbidden")}</Alert>
          ) : (
            <Field label={t("cashAccount")} hint={t("cashAccountHint", { currency: form.currency })} error={problem("cashAccountId") ? t(`problems.cash.${problem("cashAccountId")}`) : null}>
              <Select value={form.cashAccountId} disabled={pending} onValueChange={(value) => set({ cashAccountId: value })} data-testid="expense-cash-account">
                <option value="">{accounts.length ? t("choose") : t("noAccountInCurrency", { currency: form.currency })}</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </Field>
          )
        ) : null}
      </Card>

      {failure ? (expenseRefusal(failure) ? <ExpenseRefusalNotice error={failure} /> : <FormError kind={errorKind(failure)} />) : null}
      <ActionBar start={t("draftHint")}>
        <Button type="submit" pending={pending} data-testid="expense-save">
          {t("saveDraft")}
        </Button>
      </ActionBar>
    </form>
  );
}
