"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui";
import type { PostingState } from "@/components/finance/use-posting";
import { PurchasingPostingStatus } from "@/components/purchasing/posting-status";
import { receiptHref, receiptRefusal, type CashReceipt } from "@/lib/finance/cash-receipts";

/** An API refusal of a receipt, allocation or reversal, in words; null when it isn't one. */
export function ReceiptRefusal({ error }: { error: unknown }) {
  const t = useTranslations("cashReceipts.refusals");
  const kind = receiptRefusal(error);
  if (!kind) return null;
  return (
    <Alert data-testid="receipt-refusal" data-kind={kind}>
      {t(kind)}
    </Alert>
  );
}

/**
 * What happened to a receipt or allocation posting: the once-only posting
 * states every finance screen shows (a lost answer is checked with the
 * server before a retry is offered), with each cash-receipt refusal said in
 * its own words.
 */
export function ReceiptPostingStatus({
  state,
  onRetry,
  onCheck,
}: {
  state: PostingState<CashReceipt>;
  onRetry: () => void;
  onCheck: () => void;
}) {
  if (state.phase === "error" && receiptRefusal(state.error)) return <ReceiptRefusal error={state.error} />;
  return <PurchasingPostingStatus state={state} href={(receipt) => receiptHref(receipt.id)} onRetry={onRetry} onCheck={onCheck} />;
}
