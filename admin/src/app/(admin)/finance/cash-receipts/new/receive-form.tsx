"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Field } from "@/components/forms/field";
import { AllocationProblems, AllocationTable } from "@/components/finance/allocation-table";
import { ReceiptPostingStatus } from "@/components/finance/receipt-status";
import { usePosting } from "@/components/finance/use-posting";
import { DocumentDateFields, documentDateError, type DocumentDateValue } from "@/components/purchasing/document-date";
import { browserApi, unwrap } from "@/lib/api/client";
import type { CashAccountOption } from "@/lib/api/purchasing-server";
import { allocationPlan, OperationKey, receiptHref, unsettledRows, type CashReceipt, type Unsettled } from "@/lib/finance/cash-receipts";
import { moneyText, toFixed } from "@/lib/purchasing";
import type { components } from "@/types/api";

interface PartyOption {
  id: string;
  name: string;
  phone: string;
  cashHeld: number;
}

type ReceiveProps = Omit<Parameters<typeof ReceiveForm>[0], "onAnother">;

/** The form, remounted empty for each further receipt ("receive another"). */
export function ReceiveScreen(props: ReceiveProps) {
  const [round, setRound] = useState(0);
  return <ReceiveForm key={round} {...props} onAnother={() => setRound((value) => value + 1)} />;
}

/**
 * Receive cash: party, amount, cash account and date; then the allocations
 * (auto oldest first, or per order) with what stays unallocated, live.
 * "Review" fixes the request; "Confirm" posts it once — the operation id
 * belongs to that exact request, so a double click or a retry can only ever
 * produce one voucher.
 */
function ReceiveForm({
  onAnother,
  parties,
  partyId,
  party,
  cashHeld,
  suggestions,
  cashAccounts,
  canAllocate,
  canBackdate,
  today,
  windowDays,
}: {
  onAnother: () => void;
  parties: PartyOption[];
  partyId: string;
  party: components["schemas"]["DeliveryParty"] | null;
  cashHeld: number | null;
  /** Unsettled collections, oldest first; null without cash_receipts.allocate. */
  suggestions: Unsettled[] | null;
  /** Active IQD accounts; null without cash_accounts.view. */
  cashAccounts: CashAccountOption[] | null;
  canAllocate: boolean;
  canBackdate: boolean;
  today: string;
  windowDays: number;
}) {
  const t = useTranslations("cashReceipts.receive");
  const locale = useLocale();
  const router = useRouter();
  const posting = usePosting<CashReceipt>();
  const operation = useRef(new OperationKey());
  const [amount, setAmount] = useState("");
  const [amountGeneration, setAmountGeneration] = useState(0);
  const [cashId, setCashId] = useState(cashAccounts?.length === 1 ? cashAccounts[0].id : "");
  const [date, setDate] = useState<DocumentDateValue>({ date: today, backdateReason: "" });
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [generation, setGeneration] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [review, setReview] = useState<{ operationId: string } | null>(null);
  // Read once per form: after a receipt posts, router.refresh() brings new
  // suggestions, and "receive another" remounts the form with them.
  const [shown] = useState(() => suggestions ?? []);
  const [rows] = useState(() => unsettledRows(shown));
  const money = (value: bigint) => moneyText(value, "IQD", 0, locale);
  const held = cashHeld === null ? null : toFixed(cashHeld);
  const plan = allocationPlan({ amount, rows: canAllocate ? rows : [], applied: canAllocate ? applied : {}, cashHeld: held ?? undefined });
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";
  const posted = posting.state.phase === "posted" ? posting.state.document : null;
  const dateProblem = documentDateError(date, today, windowDays, canBackdate);
  const locked = review !== null;

  const problems = [
    ...(partyId ? [] : ["party"]),
    ...(cashId ? [] : ["cash"]),
    ...(dateProblem ? ["date"] : []),
  ];

  function body(operationId: string) {
    return {
      operation_id: operationId,
      document_date: date.date,
      ...(date.backdateReason.trim() ? { backdate_reason: date.backdateReason.trim() } : {}),
      party_id: partyId,
      cash_account_id: cashId,
      amount_iqd: amount.trim(),
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      allocations: plan.lines,
    };
  }

  function toReview() {
    setAttempted(true);
    if (problems.length || plan.problems.length) return;
    posting.reset();
    // The id belongs to this exact request: the same one again replays.
    setReview({ operationId: operation.current.id(JSON.stringify(body(""))) });
  }

  async function confirm() {
    if (!review) return;
    const settled = await posting.post(review.operationId, () =>
      unwrap(browserApi.POST("/admin/cash-receipts", { body: body(review.operationId) })),
    );
    if (settled?.phase === "posted") {
      // Cash held, unsettled collections and the party's pages read again.
      operation.current.reset();
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-6" data-testid="receive-form">
      <Card className="grid gap-4 md:grid-cols-3">
        <Field label={t("party")} name="party_id" error={attempted && !partyId ? t("errors.party") : null}>
          <Select
            value={partyId}
            disabled={locked}
            onChange={(event) =>
              router.push(event.target.value ? `/finance/cash-receipts/new?party_id=${event.target.value}` : "/finance/cash-receipts/new")
            }
            data-testid="receive-party"
          >
            <option value="">{t("pickParty")}</option>
            {parties.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} · {money(toFixed(option.cashHeld))}
              </option>
            ))}
          </Select>
        </Field>
        {party ? (
          <div className="flex flex-col gap-1 text-sm md:col-span-2" data-testid="receive-held">
            <span className="text-text-muted">{t("cashHeld")}</span>
            <span className="text-xl font-bold" dir="ltr" data-testid="receive-cash-held">
              {money(held ?? 0n)}
            </span>
            <Link href={`/delivery-parties/${party.id}`} className="font-semibold text-primary-dark hover:underline" data-testid="receive-party-link">
              {t("partyPage", { name: party.name })}
            </Link>
          </div>
        ) : (
          <p className="self-center text-sm text-text-muted md:col-span-2">{t("pickPartyHint")}</p>
        )}
      </Card>

      {party ? (
        <>
          {cashAccounts === null ? (
            <Alert data-testid="receive-no-accounts-permission">{t("needsCashAccounts")}</Alert>
          ) : cashAccounts.length === 0 ? (
            <Alert data-testid="receive-no-accounts">
              {t("noAccounts")}{" "}
              <Link href="/finance/cash-accounts" className="font-semibold underline">
                {t("noAccountsLink")}
              </Link>
            </Alert>
          ) : null}
          <Card className="grid gap-4 md:grid-cols-3">
            <Field label={t("amount")} name="amount_iqd" hint={t("amountHint")}>
              <div className="flex items-center gap-2">
                <DecimalInput
                  key={`amount-${amountGeneration}`}
                  value={amount}
                  parse={{ maxDecimals: 0 }}
                  disabled={locked}
                  onValueChange={(_, text) => setAmount(text.trim())}
                  data-testid="receive-amount"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={locked || !held || held <= 0n}
                  onClick={() => {
                    setAmount(String(cashHeld ?? 0));
                    setAmountGeneration((value) => value + 1);
                  }}
                  data-testid="receive-all-held"
                >
                  {t("allHeld")}
                </Button>
              </div>
            </Field>
            <Field label={t("cashAccount")} name="cash_account_id" error={attempted && !cashId ? t("errors.cash") : null}>
              <Select value={cashId} disabled={locked || !cashAccounts?.length} onChange={(event) => setCashId(event.target.value)} data-testid="receive-cash-account">
                <option value="">{t("pickCash")}</option>
                {(cashAccounts ?? []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </Field>
            <DocumentDateFields value={date} onChange={setDate} today={today} windowDays={windowDays} canBackdate={canBackdate} showErrors={attempted} disabled={locked} testId="receive" />
            <Field label={t("reference")} name="reference">
              <Input value={reference} maxLength={160} disabled={locked} onChange={(event) => setReference(event.target.value)} data-testid="receive-reference" />
            </Field>
            <Field label={t("notes")} name="notes">
              <Textarea value={notes} maxLength={2000} rows={2} disabled={locked} onChange={(event) => setNotes(event.target.value)} />
            </Field>
          </Card>

          <Card className="flex flex-col gap-3" data-testid="receive-allocations">
            <h2 className="text-lg font-bold">{t("allocationsTitle")}</h2>
            {canAllocate ? (
              <>
                <p className="text-sm text-text-muted">{t("allocationsBody")}</p>
                <AllocationTable
                  suggestions={shown}
                  rows={rows}
                  applied={applied}
                  generation={generation}
                  onApplied={(next, refill) => {
                    setApplied(next);
                    if (refill) setGeneration((value) => value + 1);
                  }}
                  plan={plan}
                  locked={locked}
                />
              </>
            ) : (
              <p className="text-sm text-text-muted" data-testid="receive-no-allocate">
                {t("noAllocatePermission")}
              </p>
            )}
            <AllocationProblems plan={plan} show={!posted && (attempted || Object.keys(applied).length > 0 || amount !== "")} />
          </Card>

          {review ? (
            <Card className="flex flex-col gap-3" data-testid="receive-review">
              <p className="text-sm" data-testid="receive-review-body">
                {t("reviewBody", {
                  amount: money(plan.amount),
                  party: party.name,
                  allocated: money(plan.allocated),
                  unallocated: money(plan.unallocated),
                })}
              </p>
              <ReceiptPostingStatus state={posting.state} onRetry={() => void confirm()} onCheck={() => void posting.check(review.operationId)} />
              {posted ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <Link href={receiptHref(posted.id)} className="inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold text-primary-dark hover:bg-card" data-testid="receive-open-voucher">
                    {t("openVoucher", { number: posted.document_number })}
                  </Link>
                  <Button variant="secondary" onClick={onAnother} data-testid="receive-another">
                    {t("another")}
                  </Button>
                </div>
              ) : (
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setReview(null)} disabled={busy} data-testid="receive-edit">
                    {t("edit")}
                  </Button>
                  <Button
                    onClick={() => void confirm()}
                    pending={busy}
                    disabled={posting.state.phase === "notPosted" || posting.state.phase === "processing"}
                    data-testid="receive-confirm"
                  >
                    {t("confirm")}
                  </Button>
                </div>
              )}
            </Card>
          ) : (
            <div className="flex justify-end">
              <Button onClick={toReview} disabled={cashAccounts === null || cashAccounts.length === 0} data-testid="receive-review-button">
                {t("review")}
              </Button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
