"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui";
import type { PostingState } from "@/components/finance/use-posting";
import { PurchasingPostingStatus } from "@/components/purchasing/posting-status";
import { exceptionHref, exceptionRefusal, type CustodyException } from "@/lib/finance/custody-exceptions";

/**
 * An API refusal of a custody exception or its reversal, in words, with the
 * step to take first where there is one (a receipt to reverse). Null when the
 * error is not one of these.
 */
export function ExceptionRefusal({ error, partyId }: { error: unknown; partyId?: string }) {
  const t = useTranslations("custodyExceptions.refusals");
  const kind = exceptionRefusal(error);
  if (!kind) return null;
  return (
    <Alert data-testid="exception-refusal" data-kind={kind}>
      <p>{t(kind)}</p>
      {kind === "receiptConsumed" && partyId ? (
        <Link href={`/finance/cash-receipts?party_id=${partyId}`} className="mt-1 inline-block font-semibold underline" data-testid="exception-refusal-receipts">
          {t("receiptConsumedLink")}
        </Link>
      ) : null}
    </Alert>
  );
}

/** A custody-exception posting's state, with each refusal in its own words. */
export function ExceptionPostingStatus({
  state,
  partyId,
  onRetry,
  onCheck,
}: {
  state: PostingState<CustodyException>;
  partyId?: string;
  onRetry: () => void;
  onCheck: () => void;
}) {
  if (state.phase === "error" && exceptionRefusal(state.error)) return <ExceptionRefusal error={state.error} partyId={partyId} />;
  return <PurchasingPostingStatus state={state} href={(row) => exceptionHref(row.id)} onRetry={onRetry} onCheck={onCheck} />;
}
