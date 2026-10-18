"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Download, ExternalLink, FileText } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { DocumentDateFields } from "@/components/purchasing/document-date";
import { browserApi, unwrap } from "@/lib/api/client";
import { errorKind } from "@/lib/api/errors";
import { OperationKey } from "@/lib/finance/cash-receipts";
import { entryHref } from "@/lib/finance/links";
import { documentDateProblem, moneyText, toFixed } from "@/lib/purchasing";
import {
  DEFAULT_PRECISION,
  accountsFor,
  expenseActions,
  expenseRefusal,
  newIdempotencyKey,
  parseAmount,
  receiptHref,
  type ActionState,
  type CashAccountChoice,
  type Expense,
  type ExpenseAction,
} from "@/lib/expenses";
import { STATUS_TONE } from "../expenses-view";
import { ExpenseRefusalNotice } from "../refusal";

type Journal = NonNullable<Expense["journal_entry"]>;

export function ExpenseView({
  expense,
  permissions,
  userId,
  strict,
  cashAccounts,
  today,
  windowDays,
  canBackdate,
}: {
  expense: Expense;
  permissions: readonly string[];
  userId: string | null;
  strict: boolean | null;
  cashAccounts: CashAccountChoice[] | null;
  today: string;
  windowDays: number;
  canBackdate: boolean;
}) {
  const t = useTranslations("expenses");
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const [notice, setNotice] = useState<ExpenseAction | null>(null);
  const precision = DEFAULT_PRECISION[expense.currency_code] ?? 2;
  const money = (value: number | string, currency = expense.currency_code) =>
    moneyText(toFixed(value), currency, currency === "IQD" ? 0 : (DEFAULT_PRECISION[currency] ?? 2), locale);
  const day = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium", numberingSystem: "latn", timeZone: "Asia/Baghdad" });
  const moment = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn", timeZone: "Asia/Baghdad" });
  const who = (actor: { name: string | null; username: string | null } | null) => actor?.name || actor?.username || "—";
  const actions = expenseActions(expense, { permissions, userId, strict });
  const foreign = expense.currency_code !== "IQD";
  const canViewLedger = permissions.includes("ledger.view");

  const done = (action: ExpenseAction) => {
    setNotice(action);
    router.refresh();
  };

  const journals: Array<{ label: string; entry: Journal }> = [
    ...(expense.journal_entry ? [{ label: t("detail.journal.posting"), entry: expense.journal_entry }] : []),
    ...expense.payments.map((payment) => ({ label: t("detail.journal.payment", { number: payment.document_number }), entry: payment.journal_entry })),
    ...expense.corrections.flatMap((correction) =>
      correction.postings.map((posting) => ({ label: t("detail.journal.reversal", { number: correction.document_number }), entry: posting.reversal_journal_entry })),
    ),
  ];

  const timeline: Array<{ at: string; label: string; who: string; note?: string | null; testId: string }> = [
    { at: expense.created_at, label: t("detail.timeline.created"), who: who(expense.creator), testId: "created" },
    ...(expense.posted_at ? [{ at: expense.posted_at, label: t("detail.timeline.posted"), who: who(expense.poster), testId: "posted" }] : []),
    ...expense.payments.map((payment) => ({
      at: payment.created_at,
      label: t("detail.timeline.paid", { amount: money(payment.amount_currency), number: payment.document_number }),
      who: who(payment.creator),
      note: payment.notes,
      testId: "paid",
    })),
    ...expense.corrections.map((correction) => ({
      at: correction.created_at,
      label: t("detail.timeline.reversed", { number: correction.document_number }),
      who: who(correction.creator),
      note: correction.reason,
      testId: "reversed",
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="flex flex-col gap-6" data-testid="expense-view" data-status={expense.status}>
      {notice ? (
        <Alert tone="success" data-testid="expense-notice" data-action={notice}>
          {t(`detail.done.${notice}`)}
        </Alert>
      ) : null}

      <Card className="grid gap-4 text-sm md:grid-cols-4">
        <Item label={t("detail.status")}>
          <Badge tone={STATUS_TONE[expense.status]} data-testid="expense-status" data-status={expense.status}>
            {t(`statuses.${expense.status}`)}
          </Badge>
        </Item>
        <Item label={t("detail.category")}>{locale === "ar" ? expense.category.name_ar : expense.category.name_en}</Item>
        <Item label={t("detail.payee")}>{expense.supplier?.name ?? expense.payee ?? "—"}</Item>
        <Item label={t("detail.date")}>{day(expense.document_date)}</Item>
        <Item label={t("detail.amount")}>
          <span className="text-base font-bold" dir="ltr" data-testid="expense-amount">
            {money(expense.amount_currency)}
          </span>
          {foreign && expense.amount_iqd !== null ? (
            <span className="block text-xs text-text-muted" dir="ltr" data-testid="expense-amount-iqd">
              {money(expense.amount_iqd, "IQD")} · {t("detail.rate", { rate: String(expense.exchange_rate ?? "—"), currency: expense.currency_code })}
            </span>
          ) : null}
        </Item>
        <Item label={t("detail.mode")}>
          {t(`modes.${expense.payment_mode}`)}
          {expense.cash_account ? <span className="block text-xs text-text-muted">{expense.cash_account.name}</span> : null}
        </Item>
        <Item label={t("detail.paid")}>
          <span dir="ltr" data-testid="expense-paid">
            {money(expense.paid_currency)}
          </span>
        </Item>
        <Item label={t("detail.balance")}>
          <span dir="ltr" className="font-semibold" data-testid="expense-balance">
            {money(expense.balance_currency)}
          </span>
          {foreign && expense.balance_iqd !== null ? <span className="block text-xs text-text-muted" dir="ltr">{money(expense.balance_iqd, "IQD")}</span> : null}
        </Item>
        <Item label={t("detail.descriptionLabel")}>{expense.description}</Item>
        {expense.reference_number ? <Item label={t("detail.reference")}>{expense.reference_number}</Item> : null}
        <Item label={t("detail.createdBy")}>{who(expense.creator)}</Item>
        {expense.poster ? <Item label={t("detail.postedBy")}>{who(expense.poster)}</Item> : null}
        {expense.backdate_reason ? <Item label={t("detail.backdateReason")}>{expense.backdate_reason}</Item> : null}
      </Card>

      {expense.receipt ? (
        <Card className="flex flex-col gap-3 text-sm" data-testid="expense-receipt">
          <h2 className="font-bold">{t("detail.receipt")}</h2>
          {expense.receipt.mime_type.startsWith("image/") ? (
            // A private receipt through the admin's own route; never optimised or cached.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={receiptHref(expense.receipt.id)} alt={t("detail.receipt")} className="max-h-96 w-fit rounded-md border border-border object-contain" data-testid="expense-receipt-image" />
          ) : (
            <p className="flex items-center gap-2">
              <FileText className="size-5 text-primary-dark" aria-hidden />
              {t("detail.receiptPdf")}
            </p>
          )}
          <div className="flex flex-wrap gap-4">
            <a href={receiptHref(expense.receipt.id)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-primary-dark hover:underline" data-testid="expense-receipt-open">
              <ExternalLink className="size-4" aria-hidden />
              {t("detail.receiptOpen")}
            </a>
            <a href={receiptHref(expense.receipt.id, true)} className="inline-flex items-center gap-1 font-semibold text-primary-dark hover:underline" data-testid="expense-receipt-download">
              <Download className="size-4" aria-hidden />
              {t("detail.receiptDownload")}
            </a>
          </div>
        </Card>
      ) : null}

      {actions.post.shown ? <PostPanel expense={expense} state={actions.post} onDone={() => done("post")} /> : null}
      {actions.pay.shown ? (
        <PayPanel expense={expense} state={actions.pay} precision={precision} cashAccounts={cashAccounts} today={today} windowDays={windowDays} canBackdate={canBackdate} onDone={() => done("pay")} />
      ) : null}
      {actions.reverse.shown ? (
        <ReversePanel expense={expense} state={actions.reverse} today={today} windowDays={windowDays} canBackdate={canBackdate} onDone={() => done("reverse")} />
      ) : null}

      {expense.payments.length ? (
        <Card className="overflow-x-auto text-sm" data-testid="expense-payments">
          <h2 className="mb-2 font-bold">{t("detail.payments")}</h2>
          <table className="w-full">
            <thead className="text-text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">{t("detail.paymentColumns.number")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("detail.paymentColumns.date")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("detail.paymentColumns.account")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("detail.paymentColumns.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {expense.payments.map((payment) => (
                <tr key={payment.id} className="border-t border-border" data-testid="expense-payment">
                  <td className="px-3 py-2" dir="ltr">
                    {payment.document_number}
                  </td>
                  <td className="px-3 py-2">{day(payment.document_date)}</td>
                  <td className="px-3 py-2">{payment.cash_account.name}</td>
                  <td className="px-3 py-2 text-end" dir="ltr">
                    {money(payment.amount_currency)}
                    {foreign ? <span className="block text-xs text-text-muted">{money(payment.amount_iqd, "IQD")}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-end">
            {t("detail.remaining")}{" "}
            <span dir="ltr" className="font-bold" data-testid="expense-remaining">
              {money(expense.balance_currency)}
            </span>
          </p>
        </Card>
      ) : null}

      {expense.corrections.length ? (
        <Card className="flex flex-col gap-2 text-sm" data-testid="expense-corrections">
          <h2 className="font-bold">{t("detail.corrections")}</h2>
          {expense.corrections.map((correction) => (
            <div key={correction.id} className="rounded-md border border-border p-3" data-testid="expense-correction">
              <p className="font-semibold" dir="ltr">
                {correction.document_number}
              </p>
              <p>{correction.reason}</p>
              <p className="text-xs text-text-muted">
                {day(correction.document_date)} · {who(correction.creator)}
              </p>
            </div>
          ))}
        </Card>
      ) : null}

      {journals.length ? (
        <Card className="flex flex-col gap-4 overflow-x-auto text-sm" data-testid="expense-journals">
          <h2 className="font-bold">{t("detail.journals")}</h2>
          {journals.map(({ label, entry }) => (
            <div key={entry.id} data-testid="expense-journal">
              <p className="mb-1 font-semibold">
                {label} ·{" "}
                {canViewLedger ? (
                  <Link href={entryHref(entry.id)} className="text-primary-dark hover:underline" dir="ltr">
                    {entry.document_number}
                  </Link>
                ) : (
                  <span dir="ltr">{entry.document_number}</span>
                )}
              </p>
              <table className="w-full">
                <tbody>
                  {entry.lines.map((line) => (
                    <tr key={line.id} className="border-t border-border">
                      <td className="px-3 py-1.5">
                        <span dir="ltr" className="font-mono">
                          {line.account.code}
                        </span>{" "}
                        {locale === "ar" ? line.account.name_ar : line.account.name_en}
                      </td>
                      <td className="px-3 py-1.5 text-end" dir="ltr">
                        {Number(line.debit_base) ? money(String(line.debit_base), "IQD") : ""}
                      </td>
                      <td className="px-3 py-1.5 text-end" dir="ltr">
                        {Number(line.credit_base) ? money(String(line.credit_base), "IQD") : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </Card>
      ) : null}

      <Card className="text-sm" data-testid="expense-timeline">
        <h2 className="mb-3 font-bold">{t("detail.timelineTitle")}</h2>
        <ol className="flex flex-col gap-3 border-s border-border ps-4">
          {timeline.map((event, index) => (
            <li key={`${event.testId}-${index}`} data-testid="expense-event" data-type={event.testId}>
              <p className="font-semibold">{event.label}</p>
              <p className="text-xs text-text-muted">
                {moment(event.at)} · {event.who}
              </p>
              {event.note ? <p className="mt-1">{event.note}</p> : null}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-text-muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}

/* ------------------------------------------------------------- actions */

/** Post one write once: the Idempotency-Key is tied to what is sent; a second click is ignored. */
function useWrite() {
  const key = useRef(new OperationKey(newIdempotencyKey));
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  async function run(signature: unknown, call: (idempotencyKey: string) => Promise<unknown>, onDone: () => void) {
    if (pending) return;
    setFailure(null);
    setPending(true);
    try {
      await call(key.current.id(JSON.stringify(signature)));
      // Done: the next write is a new request even with the same body — two
      // equal partial payments are two payments, not a replay of the first.
      key.current.reset();
      onDone();
    } catch (error) {
      setFailure(error);
    } finally {
      setPending(false);
    }
  }
  return { pending, failure, run };
}

function Failure({ error }: { error: unknown }) {
  if (!error) return null;
  return expenseRefusal(error) ? <ExpenseRefusalNotice error={error} /> : <FormError kind={errorKind(error)} />;
}

/** Shown, but the person created it and strict separation of duties applies. */
function OwnDocument({ state }: { state: ActionState }) {
  const t = useTranslations("expenses.actions");
  if (!state.shown) return null;
  if (state.blocked) return <Alert data-testid="expense-sod-blocked">{t("sodBlocked")}</Alert>;
  return state.ownDocument ? (
    <p className="text-xs text-text-muted" data-testid="expense-sod-hint">
      {t("sodHint")}
    </p>
  ) : null;
}

function Panel({ title, body, children, testId }: { title: string; body: string; children: ReactNode; testId: string }) {
  return (
    <Card className="flex flex-col gap-3 border-primary/40" data-testid={testId}>
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-1 text-sm text-text-muted">{body}</p>
      </div>
      {children}
    </Card>
  );
}

function PostPanel({ expense, state, onDone }: { expense: Expense; state: ActionState; onDone: () => void }) {
  const t = useTranslations("expenses.actions");
  const write = useWrite();
  const [note, setNote] = useState("");
  const blocked = state.shown && state.blocked;
  const tooShort = note.trim().length > 0 && note.trim().length < 3;

  return (
    <Panel title={t("postTitle")} body={t("postBody")} testId="expense-post-panel">
      <OwnDocument state={state} />
      <Field label={t("note")} error={tooShort ? t("noteTooShort") : null}>
        <Textarea rows={2} maxLength={500} value={note} disabled={write.pending || blocked} onChange={(event) => setNote(event.target.value)} data-testid="expense-post-note" />
      </Field>
      <Failure error={write.failure} />
      <div className="flex justify-end">
        <Button
          pending={write.pending}
          disabled={blocked || tooShort}
          onClick={() => {
            const body = note.trim() ? { note: note.trim() } : {};
            void write.run(
              body,
              (idempotencyKey) =>
                unwrap(browserApi.POST("/admin/expenses/{id}/post", { params: { path: { id: expense.id }, header: { "Idempotency-Key": idempotencyKey } }, body })),
              onDone,
            );
          }}
          data-testid="expense-post-submit"
        >
          {t("post")}
        </Button>
      </div>
    </Panel>
  );
}

function PayPanel({
  expense,
  state,
  precision,
  cashAccounts,
  today,
  windowDays,
  canBackdate,
  onDone,
}: {
  expense: Expense;
  state: ActionState;
  precision: number;
  cashAccounts: CashAccountChoice[] | null;
  today: string;
  windowDays: number;
  canBackdate: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("expenses.actions");
  const tf = useTranslations("expenses.form");
  const locale = useLocale();
  const write = useWrite();
  const accounts = cashAccounts ? accountsFor(expense.currency_code, cashAccounts) : [];
  const [accountId, setAccountId] = useState(accounts.length === 1 ? accounts[0].id : "");
  const [amount, setAmount] = useState(String(expense.balance_currency));
  const [date, setDate] = useState({ date: today, backdateReason: "" });
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [attempted, setAttempted] = useState(false);
  const blocked = state.shown && state.blocked;
  const parsed = parseAmount(amount, precision, expense.balance_currency);
  const dateProblem = documentDateProblem(date.date, today, { windowDays, canBackdate, reason: date.backdateReason });

  function pay() {
    setAttempted(true);
    if (!parsed.ok || !accountId || dateProblem) return;
    const body = {
      cash_account_id: accountId,
      amount: parsed.value,
      document_date: date.date,
      ...(date.date < today && date.backdateReason.trim().length >= 3 ? { backdate_reason: date.backdateReason.trim() } : {}),
      ...(reference.trim() ? { reference_number: reference.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    void write.run(
      body,
      (idempotencyKey) =>
        unwrap(browserApi.POST("/admin/expenses/{id}/payments", { params: { path: { id: expense.id }, header: { "Idempotency-Key": idempotencyKey } }, body })),
      () => {
        setAttempted(false);
        onDone();
      },
    );
  }

  return (
    <Panel
      title={t("payTitle")}
      body={t("payBody", { balance: moneyText(toFixed(expense.balance_currency), expense.currency_code, precision, locale) })}
      testId="expense-pay-panel"
    >
      <OwnDocument state={state} />
      {cashAccounts === null ? <Alert data-testid="expense-pay-no-accounts">{tf("cashAccountsForbidden")}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <Field label={t("payAmount")} hint={t("payAmountHint")} error={attempted && !parsed.ok ? tf(`problems.amount.${parsed.problem}`, { digits: precision }) : null}>
          <Input inputMode="decimal" dir="ltr" value={amount} disabled={write.pending || blocked} onChange={(event) => setAmount(event.target.value)} data-testid="expense-pay-amount" />
        </Field>
        <Field label={tf("cashAccount")} error={attempted && !accountId ? tf("problems.cash.required") : null}>
          <Select value={accountId} disabled={write.pending || blocked || !cashAccounts} onChange={(event) => setAccountId(event.target.value)} data-testid="expense-pay-account">
            <option value="">{accounts.length ? tf("choose") : tf("noAccountInCurrency", { currency: expense.currency_code })}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tf("reference")}>
          <Input maxLength={160} value={reference} disabled={write.pending || blocked} onChange={(event) => setReference(event.target.value)} data-testid="expense-pay-reference" />
        </Field>
      </div>
      <DocumentDateFields value={date} onChange={setDate} today={today} windowDays={windowDays} canBackdate={canBackdate} showErrors={attempted} disabled={write.pending || blocked} testId="expense-pay-date" />
      <Field label={t("notes")}>
        <Textarea rows={2} maxLength={1000} value={notes} disabled={write.pending || blocked} onChange={(event) => setNotes(event.target.value)} data-testid="expense-pay-notes" />
      </Field>
      <Failure error={write.failure} />
      <div className="flex justify-end">
        <Button pending={write.pending} disabled={blocked} onClick={pay} data-testid="expense-pay-submit">
          {t("pay")}
        </Button>
      </div>
    </Panel>
  );
}

function ReversePanel({
  expense,
  state,
  today,
  windowDays,
  canBackdate,
  onDone,
}: {
  expense: Expense;
  state: ActionState;
  today: string;
  windowDays: number;
  canBackdate: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("expenses.actions");
  const write = useWrite();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState({ date: today, backdateReason: "" });
  const [attempted, setAttempted] = useState(false);
  const blocked = state.shown && state.blocked;
  const tooShort = reason.trim().length < 3;
  const dateProblem = documentDateProblem(date.date, today, { windowDays, canBackdate, reason: date.backdateReason });

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button variant="danger" onClick={() => setOpen(true)} data-testid="expense-reverse">
          {t("reverse")}
        </Button>
      </div>
    );
  }

  return (
    <Panel title={t("reverseTitle")} body={t("reverseBody")} testId="expense-reverse-panel">
      <OwnDocument state={state} />
      <Field label={t("reverseReason")} error={attempted && tooShort ? t("reverseReasonRequired") : null}>
        <Textarea rows={2} maxLength={500} value={reason} disabled={write.pending || blocked} onChange={(event) => setReason(event.target.value)} data-testid="expense-reverse-reason" />
      </Field>
      <DocumentDateFields value={date} onChange={setDate} today={today} windowDays={windowDays} canBackdate={canBackdate} showErrors={attempted} disabled={write.pending || blocked} testId="expense-reverse-date" />
      <Failure error={write.failure} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={write.pending} onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
        <Button
          variant="danger"
          pending={write.pending}
          disabled={blocked}
          onClick={() => {
            setAttempted(true);
            if (tooShort || dateProblem) return;
            const body = {
              reason: reason.trim(),
              document_date: date.date,
              ...(date.date < today && date.backdateReason.trim().length >= 3 ? { backdate_reason: date.backdateReason.trim() } : {}),
            };
            void write.run(
              body,
              (idempotencyKey) =>
                unwrap(browserApi.POST("/admin/expenses/{id}/reverse", { params: { path: { id: expense.id }, header: { "Idempotency-Key": idempotencyKey } }, body })),
              onDone,
            );
          }}
          data-testid="expense-reverse-submit"
        >
          {t("reverseConfirm")}
        </Button>
      </div>
    </Panel>
  );
}
