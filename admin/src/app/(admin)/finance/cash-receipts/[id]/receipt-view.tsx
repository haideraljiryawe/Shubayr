"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Alert, Badge, Button, Card, Textarea } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { AllocationProblems, AllocationTable } from "@/components/finance/allocation-table";
import { ReceiptPostingStatus } from "@/components/finance/receipt-status";
import { usePosting } from "@/components/finance/use-posting";
import { useStoreDateTime } from "@/components/orders/use-store-date";
import { DocumentDateFields, documentDateError, type DocumentDateValue } from "@/components/purchasing/document-date";
import { browserApi, unwrap } from "@/lib/api/client";
import { allocationPlan, OperationKey, unsettledRows, type CashReceipt, type Unsettled } from "@/lib/finance/cash-receipts";
import { entryHref } from "@/lib/finance/links";
import { fixedText, moneyText, toFixed } from "@/lib/purchasing";

type Notice = { kind: "allocated" | "reversed"; number: string };

export function ReceiptView({
  receipt,
  suggestions,
  canReverse,
  canViewLedger,
  canBackdate,
  today,
  windowDays,
}: {
  receipt: CashReceipt;
  /** The party's unsettled collections; null when nothing can be allocated here. */
  suggestions: Unsettled[] | null;
  canReverse: boolean;
  canViewLedger: boolean;
  canBackdate: boolean;
  today: string;
  windowDays: number;
}) {
  const t = useTranslations("cashReceipts.detail");
  const locale = useLocale();
  const format = useFormatter();
  const dateTime = useStoreDateTime();
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const money = (value: number) => moneyText(toFixed(value), "IQD", 0, locale);
  const day = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium", numberingSystem: "latn", timeZone: "UTC" });
  const reversed = receipt.status === "reversed";

  function posted(next: Notice) {
    setNotice(next);
    // The voucher, the party's custody and its collections read again.
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6" data-testid="receipt-view" data-status={receipt.status}>
      {notice ? (
        <Alert tone="success" data-testid="receipt-notice" data-kind={notice.kind}>
          {t(`notice.${notice.kind}`, { number: notice.number })}
        </Alert>
      ) : null}

      <Card className="grid gap-4 text-sm md:grid-cols-4">
        <Item label={t("status")}>
          <Badge tone={reversed ? "neutral" : "success"} data-testid="receipt-status" data-status={receipt.status}>
            {t(`statuses.${receipt.status}`)}
          </Badge>
        </Item>
        <Item label={t("party")}>
          <Link href={`/delivery-parties/${receipt.party_id}`} className="font-semibold text-primary-dark hover:underline" data-testid="receipt-party">
            {receipt.party.name}
          </Link>
        </Item>
        <Item label={t("cashAccount")}>
          <span data-testid="receipt-account">{receipt.cash_account.name}</span>
        </Item>
        <Item label={t("documentDate")}>{day(receipt.document_date)}</Item>
        <Item label={t("amount")}>
          <span className="font-bold" dir="ltr" data-testid="receipt-amount">
            {money(receipt.amount_iqd)}
          </span>
        </Item>
        <Item label={t("allocated")}>
          <span dir="ltr" data-testid="receipt-allocated">
            {money(receipt.allocated_amount_iqd)}
          </span>
          {reversed && receipt.original_allocated_amount_iqd > 0 ? (
            <span className="block text-xs text-text-muted">
              {t("originalAllocated", { amount: money(receipt.original_allocated_amount_iqd) })}
            </span>
          ) : null}
        </Item>
        <Item label={t("unallocated")}>
          <span className="font-bold" dir="ltr" data-testid="receipt-unallocated">
            {money(receipt.unallocated_amount_iqd)}
          </span>
        </Item>
        <Item label={t("posted")}>
          {dateTime(receipt.created_at)}
          {canViewLedger ? (
            <Link href={entryHref(receipt.journal_entry_id)} className="block font-semibold text-primary-dark hover:underline" data-testid="receipt-entry">
              {t("viewEntry")}
            </Link>
          ) : null}
        </Item>
        {receipt.reference ? <Item label={t("reference")}>{receipt.reference}</Item> : null}
        {receipt.notes ? <Item label={t("notes")}>{receipt.notes}</Item> : null}
        {receipt.backdate_reason ? <Item label={t("backdateReason")}>{receipt.backdate_reason}</Item> : null}
      </Card>

      {receipt.reversal ? (
        <Alert tone="info" data-testid="receipt-reversal">
          <p className="font-semibold">
            {t("reversedBy", { number: receipt.reversal.document_number, date: day(receipt.reversal.document_date) })}
          </p>
          <p data-testid="receipt-reversal-reason">{receipt.reversal.reason}</p>
          <p className="mt-1 text-xs">{t("reversedNote")}</p>
        </Alert>
      ) : null}

      <Card className="flex flex-col gap-3" data-testid="receipt-batches">
        <h2 className="text-lg font-bold">{t("allocationsTitle")}</h2>
        {receipt.allocation_batches.length === 0 ? (
          <p className="text-sm text-text-muted" data-testid="receipt-no-allocations">
            {t("noAllocations")}
          </p>
        ) : (
          receipt.allocation_batches.map((batch) => (
            <div key={batch.id} className="rounded-md border border-border p-3" data-testid="receipt-batch" data-active={String(batch.active)}>
              <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold" dir="ltr">
                  {batch.document_number}
                </span>
                <span className="text-text-muted">{day(batch.document_date)}</span>
                {batch.active ? null : <Badge tone="neutral">{t("batchInactive")}</Badge>}
              </p>
              <table className="w-full text-sm">
                <tbody>
                  {batch.allocations.map((allocation) => (
                    <tr key={allocation.id} className="border-t border-border" data-testid="receipt-allocation" data-order={allocation.order.order_number}>
                      <td className="py-1">
                        <Link href={`/orders/${allocation.order.id}`} className="font-semibold text-primary-dark hover:underline" dir="ltr" data-testid="receipt-allocation-order">
                          {allocation.order.order_number}
                        </Link>
                      </td>
                      <td className="py-1 text-end" dir="ltr" data-testid="receipt-allocation-amount">
                        {money(allocation.amount_iqd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </Card>

      {suggestions ? (
        <AllocatePanel
          // A later allocation re-reads the remainder and the suggestions.
          key={String(receipt.unallocated_amount_iqd)}
          receipt={receipt}
          suggestions={suggestions}
          canBackdate={canBackdate}
          today={today}
          windowDays={windowDays}
          onPosted={(number) => posted({ kind: "allocated", number })}
        />
      ) : null}
      {canReverse ? <ReversePanel receipt={receipt} onPosted={(number) => posted({ kind: "reversed", number })} /> : null}
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-text-muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}

/** Allocate what is still unallocated on the receipt to the party's unsettled orders. */
function AllocatePanel({
  receipt,
  suggestions,
  canBackdate,
  today,
  windowDays,
  onPosted,
}: {
  receipt: CashReceipt;
  suggestions: Unsettled[];
  canBackdate: boolean;
  today: string;
  windowDays: number;
  onPosted: (number: string) => void;
}) {
  const t = useTranslations("cashReceipts.detail");
  const posting = usePosting<CashReceipt>();
  const operation = useRef(new OperationKey());
  const [rows] = useState(() => unsettledRows(suggestions));
  const [shown] = useState(() => suggestions);
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [generation, setGeneration] = useState(0);
  const [date, setDate] = useState<DocumentDateValue>({ date: today, backdateReason: "" });
  const [attempted, setAttempted] = useState(false);
  const plan = allocationPlan({ amount: fixedText(toFixed(receipt.unallocated_amount_iqd), 6), rows, applied });
  const dateProblem = documentDateError(date, today, windowDays, canBackdate);
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";
  const [operationId, setOperationId] = useState<string | null>(null);

  async function allocate() {
    setAttempted(true);
    if (plan.problems.length || plan.lines.length === 0 || dateProblem) return;
    const payload = {
      document_date: date.date,
      ...(date.backdateReason.trim() ? { backdate_reason: date.backdateReason.trim() } : {}),
      allocations: plan.lines,
    };
    const id = operation.current.id(JSON.stringify(payload));
    setOperationId(id);
    const settled = await posting.post(id, () =>
      unwrap(
        browserApi.POST("/admin/cash-receipts/{id}/allocations", {
          params: { path: { id: receipt.id } },
          body: { operation_id: id, ...payload },
        }),
      ),
    );
    if (settled?.phase === "posted") {
      operation.current.reset();
      const batch = settled.document.allocation_batches.at(-1);
      onPosted(batch?.document_number ?? settled.document.document_number);
    }
  }

  return (
    <Card className="flex flex-col gap-3" data-testid="receipt-allocate">
      <h2 className="text-lg font-bold">{t("allocateTitle")}</h2>
      <p className="text-sm text-text-muted">{t("allocateBody")}</p>
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
        locked={busy || posting.state.phase === "posted"}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <DocumentDateFields value={date} onChange={setDate} today={today} windowDays={windowDays} canBackdate={canBackdate} showErrors={attempted} disabled={busy} testId="allocate" />
      </div>
      <AllocationProblems plan={plan} show={posting.state.phase !== "posted" && (attempted || Object.keys(applied).length > 0)} />
      {attempted && plan.lines.length === 0 && plan.problems.length === 0 ? (
        <p className="text-sm font-semibold text-error-dark" role="alert" data-testid="allocate-empty">
          {t("allocateEmpty")}
        </p>
      ) : null}
      {operationId ? (
        <ReceiptPostingStatus state={posting.state} onRetry={() => void allocate()} onCheck={() => void posting.check(operationId)} />
      ) : null}
      {posting.state.phase === "posted" ? null : (
        <div className="flex justify-end">
          <Button onClick={() => void allocate()} pending={busy} data-testid="allocate-submit">
            {t("allocateSubmit")}
          </Button>
        </div>
      )}
    </Card>
  );
}

/**
 * Reverse the voucher with a reason. The API refuses the person who posted
 * it (separation of duties); that refusal is said in words, here.
 */
function ReversePanel({ receipt, onPosted }: { receipt: CashReceipt; onPosted: (number: string) => void }) {
  const t = useTranslations("cashReceipts.detail");
  const posting = usePosting<CashReceipt>();
  const operation = useRef(new OperationKey());
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(null);
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";
  const tooShort = reason.trim().length < 3;

  async function reverse() {
    setAttempted(true);
    if (tooShort) return;
    const id = operation.current.id(reason.trim());
    setOperationId(id);
    const settled = await posting.post(id, () =>
      unwrap(
        browserApi.POST("/admin/cash-receipts/{id}/reversal", {
          params: { path: { id: receipt.id } },
          body: { operation_id: id, reason: reason.trim() },
        }),
      ),
    );
    if (settled?.phase === "posted") onPosted(settled.document.reversal?.document_number ?? settled.document.document_number);
  }

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button variant="danger" onClick={() => setOpen(true)} data-testid="receipt-reverse">
          {t("reverse")}
        </Button>
      </div>
    );
  }
  return (
    <Card className="flex flex-col gap-3 border-error/40" data-testid="receipt-reverse-panel">
      <h2 className="text-lg font-bold">{t("reverseTitle")}</h2>
      <p className="text-sm text-text-muted">{t("reverseBody")}</p>
      <Field label={t("reverseReason")} name="reason" error={attempted && tooShort ? t("reverseReasonRequired") : null}>
        <Textarea value={reason} maxLength={500} rows={2} disabled={busy} onChange={(event) => setReason(event.target.value)} data-testid="receipt-reverse-reason" />
      </Field>
      {operationId ? (
        <ReceiptPostingStatus state={posting.state} onRetry={() => void reverse()} onCheck={() => void posting.check(operationId)} />
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
        <Button variant="danger" pending={busy} onClick={() => void reverse()} data-testid="receipt-reverse-confirm">
          {t("reverseConfirm")}
        </Button>
      </div>
    </Card>
  );
}
