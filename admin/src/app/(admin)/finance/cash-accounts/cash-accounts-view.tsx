"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeftRight, Plus } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { useApiForm } from "@/components/forms/use-api-form";
import { PostingStatus } from "@/components/finance/posting-status";
import { usePosting } from "@/components/finance/use-posting";
import { browserApi, unwrap } from "@/lib/api/client";
import { fieldErrorMap } from "@/lib/api/errors";
import { storeDay } from "@/lib/finance/dates";
import { decimalPlaces, formatAmount, isPositive } from "@/lib/finance/money";
import { newOperationId } from "@/lib/finance/operations";
import type { components } from "@/types/api";

type CashAccount = components["schemas"]["CashAccount"];

export interface CurrencyInfo {
  code: string;
  precision: number;
  enabled: boolean;
  isBase: boolean;
}

function precisionOf(currencies: CurrencyInfo[], code: string): number {
  return currencies.find((currency) => currency.code === code)?.precision ?? (code === "IQD" ? 0 : 2);
}

export function CashAccountsView({
  accounts,
  currencies,
}: {
  accounts: CashAccount[];
  currencies: CurrencyInfo[];
}) {
  const t = useTranslations("cashAccounts");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<{ id: string; mode: "edit" | "opening" } | null>(null);
  const [deleting, setDeleting] = useState<CashAccount | null>(null);
  const money = (value: string | number, code: string) =>
    formatAmount(value, code, precisionOf(currencies, code), locale);
  const current = accounts.find((account) => account.id === selected?.id) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-x-auto p-5">
        {accounts.length === 0 ? (
          <p className="text-sm text-text-muted" data-testid="accounts-empty">{t("empty")}</p>
        ) : (
          <table className="w-full text-sm" data-testid="accounts-table">
            <thead className="text-text-muted">
              <tr>
                <th className="py-1 text-start font-semibold">{t("columns.name")}</th>
                <th className="py-1 text-start font-semibold">{t("columns.kind")}</th>
                <th className="py-1 text-end font-semibold">{t("columns.balance")}</th>
                <th className="py-1 text-end font-semibold">{t("columns.baseBalance")}</th>
                <th className="py-1 text-start font-semibold">{t("columns.status")}</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-t border-border" data-testid="account-row" data-name={account.name}>
                  <td className="py-2 font-semibold">{account.name}</td>
                  <td className="py-2">{t(`kind.${account.kind}`)}</td>
                  <td className="py-2 text-end" dir="ltr" data-testid="account-balance">
                    {money(account.balance, account.currency_code)}
                  </td>
                  <td className="py-2 text-end text-text-muted" dir="ltr">
                    {money(account.base_balance, account.base_currency_code)}
                  </td>
                  <td className="py-2">
                    <Badge tone={account.is_active ? "success" : "neutral"}>
                      {account.is_active ? t("active") : t("inactive")}
                    </Badge>
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setSelected({ id: account.id, mode: "edit" })} data-testid="account-edit">
                        {t("edit")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSelected({ id: account.id, mode: "opening" })} data-testid="account-opening">
                        {t("openingBalance")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(account)} data-testid="account-delete">
                        {t("delete")}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {current && selected?.mode === "edit" ? (
        <EditAccount key={current.id} account={current} onDone={() => { setSelected(null); router.refresh(); }} onCancel={() => setSelected(null)} />
      ) : null}
      {current && selected?.mode === "opening" ? (
        <OpeningBalance
          key={current.id}
          account={current}
          precision={precisionOf(currencies, current.currency_code)}
          onPosted={() => router.refresh()}
          onClose={() => setSelected(null)}
        />
      ) : null}

      <TransferPanel accounts={accounts} currencies={currencies} onPosted={() => router.refresh()} />

      <CreateAccount currencies={currencies} onCreated={() => router.refresh()} />

      <ConfirmDialog
        open={deleting !== null}
        title={t("deleteTitle", { name: deleting?.name ?? "" })}
        body={t("deleteBody")}
        confirmLabel={t("delete")}
        requireReason={false}
        onConfirm={async () => {
          await unwrap(browserApi.DELETE("/admin/cash-accounts/{id}", { params: { path: { id: deleting!.id } } }));
          toast(t("deleted"));
          router.refresh();
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function CreateAccount({ currencies, onCreated }: { currencies: CurrencyInfo[]; onCreated: () => void }) {
  const t = useTranslations("cashAccounts");
  const toast = useToast();
  const api = useApiForm();
  const enabled = currencies.filter((currency) => currency.enabled);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"cash" | "bank">("cash");
  const [code, setCode] = useState(enabled.find((currency) => currency.isBase)?.code ?? enabled[0]?.code ?? "IQD");
  const [nameError, setNameError] = useState<string | null>(null);

  async function submit() {
    if (name.trim().length < 2) {
      setNameError(t("errors.name"));
      return;
    }
    setNameError(null);
    const created = await api.run(() =>
      unwrap(browserApi.POST("/admin/cash-accounts", { body: { name: name.trim(), kind, currency_code: code } })),
    );
    if (!created) return;
    toast(t("created", { name: created.name }));
    setName("");
    onCreated();
  }

  return (
    <Card className="p-5">
      <form className="flex flex-col gap-4" data-testid="account-create" noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <h2 className="text-lg font-bold">{t("createTitle")}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t("columns.name")} name="name" error={nameError ?? api.fieldErrors.name}>
            <Input value={name} maxLength={160} onChange={(event) => { setName(event.target.value); api.clearField("name"); }} data-testid="account-name" />
          </Field>
          <Field label={t("columns.kind")} name="kind" error={api.fieldErrors.kind}>
            <Select value={kind} onChange={(event) => setKind(event.target.value as "cash" | "bank")} data-testid="account-kind">
              <option value="cash">{t("kind.cash")}</option>
              <option value="bank">{t("kind.bank")}</option>
            </Select>
          </Field>
          <Field label={t("currency")} name="currency_code" error={api.fieldErrors.currency_code}>
            <Select value={code} onChange={(event) => setCode(event.target.value)} data-testid="account-currency">
              {(enabled.length ? enabled : [{ code: "IQD" }]).map((currency) => (
                <option key={currency.code} value={currency.code}>{currency.code}</option>
              ))}
            </Select>
          </Field>
        </div>
        <FormError kind={api.formError} detail={api.formErrorDetail} />
        <div className="flex justify-end">
          <Button type="submit" pending={api.pending} data-testid="account-create-submit">
            <Plus className="size-4" aria-hidden />
            {t("create")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function EditAccount({ account, onDone, onCancel }: { account: CashAccount; onDone: () => void; onCancel: () => void }) {
  const t = useTranslations("cashAccounts");
  const toast = useToast();
  const api = useApiForm();
  const [name, setName] = useState(account.name);
  const [active, setActive] = useState(account.is_active);

  async function submit() {
    const saved = await api.run(() =>
      unwrap(
        browserApi.PATCH("/admin/cash-accounts/{id}", {
          params: { path: { id: account.id } },
          body: { name: name.trim(), is_active: active },
        }),
      ),
    );
    if (!saved) return;
    toast(t("saved"));
    onDone();
  }

  return (
    <Card className="p-5">
      <form className="flex flex-col gap-4" data-testid="account-edit-form" noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <h2 className="text-lg font-bold">{t("editTitle", { name: account.name })}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("columns.name")} name="name" error={api.fieldErrors.name}>
            <Input value={name} maxLength={160} onChange={(event) => setName(event.target.value)} />
          </Field>
          <label className="flex items-center gap-2 self-center text-sm font-semibold">
            <input type="checkbox" className="size-4" checked={active} onChange={(event) => setActive(event.target.checked)} data-testid="account-active" />
            {t("active")}
          </label>
        </div>
        <FormError kind={api.formError} detail={api.formErrorDetail} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>{t("cancel")}</Button>
          <Button type="submit" pending={api.pending} data-testid="account-edit-submit">{t("save")}</Button>
        </div>
      </form>
    </Card>
  );
}

/** The account's opening-balance document: once, dated, with the same once-only posting. */
function OpeningBalance({
  account,
  precision,
  onPosted,
  onClose,
}: {
  account: CashAccount;
  precision: number;
  onPosted: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("cashAccounts");
  const posting = usePosting();
  const [operationId] = useState(newOperationId);
  const [amount, setAmount] = useState<string | null>(null);
  const [date, setDate] = useState(storeDay());
  const [backdateReason, setBackdateReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const server = posting.state.phase === "error" ? fieldErrorMap(posting.state.error.errors) : {};

  async function submit() {
    const found: Record<string, string> = {};
    if (!amount || !isPositive(amount)) found.amount = t("errors.amount");
    else if (decimalPlaces(amount) > precision) found.amount = t("errors.precision", { precision });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) found.document_date = t("errors.date");
    else if (date > storeDay()) found.document_date = t("errors.future");
    setErrors(found);
    if (Object.keys(found).length || !amount) return;
    await posting.post(operationId, () =>
      unwrap(
        browserApi.POST("/admin/cash-accounts/{id}/opening-balance", {
          params: { path: { id: account.id } },
          body: {
            operation_id: operationId,
            amount,
            document_date: date,
            ...(backdateReason.trim() ? { backdate_reason: backdateReason.trim() } : {}),
          },
        }),
      ),
    );
    onPosted();
  }

  const posted = posting.state.phase === "posted";
  return (
    <Card className="p-5">
      <form className="flex flex-col gap-4" data-testid="opening-form" noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <h2 className="text-lg font-bold">{t("openingTitle", { name: account.name })}</h2>
        <p className="text-sm text-text-muted">{t("openingBody")}</p>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t("amountIn", { code: account.currency_code })} name="amount" error={errors.amount ?? server.amount}>
            <DecimalInput value="" parse={{ maxDecimals: precision }} onValueChange={(value) => setAmount(value)} data-testid="opening-amount" disabled={posted} />
          </Field>
          <Field label={t("documentDate")} name="document_date" error={errors.document_date ?? server.document_date}>
            <Input type="date" value={date} max={storeDay()} onChange={(event) => setDate(event.target.value)} data-testid="opening-date" disabled={posted} />
          </Field>
          <Field label={t("backdateReason")} name="backdate_reason" hint={t("backdateHint")} error={server.backdate_reason}>
            <Input value={backdateReason} onChange={(event) => setBackdateReason(event.target.value)} disabled={posted} />
          </Field>
        </div>
        <PostingStatus state={posting.state} onRetry={() => void submit()} onCheck={() => void posting.check(operationId)} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{posted ? t("close") : t("cancel")}</Button>
          {posted ? null : (
            <Button type="submit" pending={posting.state.phase === "posting" || posting.state.phase === "checking"} data-testid="opening-submit">
              {t("postOpening")}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

/**
 * A transfer between two accounts of the same currency, as a numbered
 * document. Review first, then confirm: the operation id is fixed at review,
 * so the confirm button — clicked once, twice, or again after a lost answer —
 * can only ever produce one document.
 */
function TransferPanel({
  accounts,
  currencies,
  onPosted,
}: {
  accounts: CashAccount[];
  currencies: CurrencyInfo[];
  onPosted: () => void;
}) {
  const t = useTranslations("cashAccounts");
  const locale = useLocale();
  const posting = usePosting();
  const active = accounts.filter((account) => account.is_active);
  const [fromId, setFromId] = useState(active[0]?.id ?? "");
  const from = active.find((account) => account.id === fromId) ?? null;
  const targets = active.filter((account) => account.id !== fromId && account.currency_code === from?.currency_code);
  const [toId, setToId] = useState("");
  const to = targets.find((account) => account.id === toId) ?? null;
  const [amount, setAmount] = useState<string | null>(null);
  const [date, setDate] = useState(storeDay());
  const [reason, setReason] = useState("");
  const [backdateReason, setBackdateReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState<{ operationId: string } | null>(null);
  const [generation, setGeneration] = useState(0);
  const precision = from ? precisionOf(currencies, from.currency_code) : 0;
  const server = posting.state.phase === "error" ? fieldErrorMap(posting.state.error.errors) : {};
  const posted = posting.state.phase === "posted";

  if (active.length < 2) {
    return (
      <Card className="p-5">
        <h2 className="text-lg font-bold">{t("transfer.title")}</h2>
        <p className="mt-2 text-sm text-text-muted">{t("transfer.needTwo")}</p>
      </Card>
    );
  }

  function toReview() {
    const found: Record<string, string> = {};
    if (!to) found.to_account_id = t("errors.to");
    if (!amount || !isPositive(amount)) found.amount = t("errors.amount");
    else if (decimalPlaces(amount) > precision) found.amount = t("errors.precision", { precision });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) found.document_date = t("errors.date");
    else if (date > storeDay()) found.document_date = t("errors.future");
    if (reason.trim().length < 3) found.reason = t("errors.reason");
    setErrors(found);
    if (Object.keys(found).length) return;
    posting.reset();
    // The document's identity is fixed here, before anything is sent.
    setReview({ operationId: newOperationId() });
  }

  async function confirm() {
    if (!review || !from || !to || !amount) return;
    await posting.post(review.operationId, () =>
      unwrap(
        browserApi.POST("/admin/cash-transfers", {
          body: {
            operation_id: review.operationId,
            from_account_id: from.id,
            to_account_id: to.id,
            amount,
            document_date: date,
            reason: reason.trim(),
            ...(backdateReason.trim() ? { backdate_reason: backdateReason.trim() } : {}),
          },
        }),
      ),
    );
    onPosted();
  }

  function startOver() {
    setReview(null);
    posting.reset();
    setAmount(null);
    setReason("");
    setGeneration((value) => value + 1);
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4" data-testid="transfer-panel">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ArrowLeftRight className="size-5" aria-hidden />
          {t("transfer.title")}
        </h2>
        {review === null ? (
          <form className="flex flex-col gap-4" noValidate onSubmit={(event) => { event.preventDefault(); toReview(); }}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t("transfer.from")} name="from_account_id" error={server.from_account_id}>
                <Select value={fromId} onChange={(event) => { setFromId(event.target.value); setToId(""); }} data-testid="transfer-from">
                  {active.map((account) => (
                    <option key={account.id} value={account.id}>{account.name} · {account.currency_code}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t("transfer.to")} name="to_account_id" error={errors.to_account_id ?? server.to_account_id} hint={t("transfer.sameCurrency")}>
                <Select value={toId} onChange={(event) => setToId(event.target.value)} data-testid="transfer-to">
                  <option value="">{t("transfer.pick")}</option>
                  {targets.map((account) => (
                    <option key={account.id} value={account.id}>{account.name} · {account.currency_code}</option>
                  ))}
                </Select>
              </Field>
              <Field key={`amount-${generation}`} label={t("amountIn", { code: from?.currency_code ?? "" })} name="amount" error={errors.amount ?? server.amount}>
                <DecimalInput value={amount ?? ""} parse={{ maxDecimals: precision }} onValueChange={(value) => setAmount(value)} data-testid="transfer-amount" />
              </Field>
              <Field label={t("documentDate")} name="document_date" error={errors.document_date ?? server.document_date}>
                <Input type="date" value={date} max={storeDay()} onChange={(event) => setDate(event.target.value)} data-testid="transfer-date" />
              </Field>
              <Field label={t("transfer.reason")} name="reason" error={errors.reason ?? server.reason}>
                <Textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} data-testid="transfer-reason" />
              </Field>
              <Field label={t("backdateReason")} name="backdate_reason" hint={t("backdateHint")} error={server.backdate_reason}>
                <Input value={backdateReason} onChange={(event) => setBackdateReason(event.target.value)} />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" data-testid="transfer-review">{t("transfer.review")}</Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4" data-testid="transfer-preview">
            <dl className="grid gap-2 rounded-md bg-card p-4 text-sm md:grid-cols-2">
              <dt className="text-text-muted">{t("transfer.from")}</dt>
              <dd className="font-semibold">{from?.name}</dd>
              <dt className="text-text-muted">{t("transfer.to")}</dt>
              <dd className="font-semibold">{to?.name}</dd>
              <dt className="text-text-muted">{t("transfer.amount")}</dt>
              <dd className="font-semibold" dir="ltr" data-testid="transfer-preview-amount">
                {amount && from ? formatAmount(amount, from.currency_code, precision, locale) : ""}
              </dd>
              <dt className="text-text-muted">{t("documentDate")}</dt>
              <dd dir="ltr">{date}</dd>
              <dt className="text-text-muted">{t("transfer.reason")}</dt>
              <dd>{reason}</dd>
            </dl>
            <PostingStatus state={posting.state} onRetry={() => void confirm()} onCheck={() => void posting.check(review.operationId)} />
            <div className="flex justify-end gap-2">
              {posted ? (
                <Button variant="secondary" onClick={startOver} data-testid="transfer-new">{t("transfer.another")}</Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => setReview(null)} disabled={posting.state.phase === "posting"}>
                    {t("transfer.edit")}
                  </Button>
                  <Button
                    onClick={() => void confirm()}
                    pending={posting.state.phase === "posting" || posting.state.phase === "checking"}
                    disabled={posting.state.phase === "notPosted" || posting.state.phase === "processing"}
                    data-testid="transfer-confirm"
                  >
                    {t("transfer.confirm")}
                  </Button>
                </>
              )}
            </div>
            {posting.state.phase === "error" ? <Alert tone="info">{t("transfer.fixAndReview")}</Alert> : null}
          </div>
        )}
      </div>
    </Card>
  );
}
