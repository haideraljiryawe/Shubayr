"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert, Button } from "@/components/ui";
import { FormError } from "@/components/forms/form-error";
import type { PostingState } from "@/components/finance/use-posting";
import { errorKind } from "@/lib/api/errors";
import { entryHref } from "@/lib/finance/links";
import { isClosedPeriod } from "@/lib/finance/operations";
import { isMissingRate, isRateOverrideForbidden, isSeparationOfDuties } from "@/lib/purchasing";

interface Posted {
  id: string;
  document_number: string;
  journal_entry_id?: string | null;
}

/**
 * What happened to a purchasing posting, with the next safe step: the same
 * once-only states as every other posting (a lost answer is checked with
 * the server before a retry is offered), plus the purchasing refusals
 * worth their own words.
 */
export function PurchasingPostingStatus<T extends Posted>({
  state,
  href,
  onRetry,
  onCheck,
}: {
  state: PostingState<T>;
  /** The posted document's own page, when it has one. */
  href?: (document: T) => string | null;
  onRetry: () => void;
  onCheck: () => void;
}) {
  const t = useTranslations("posting");
  const tp = useTranslations("purchasing.errors");
  switch (state.phase) {
    case "posted": {
      const page = href?.(state.document) ?? null;
      return (
        <Alert tone="success" data-testid="posting-done">
          {t("posted", { number: state.document.document_number })}{" "}
          {page ? (
            <Link className="font-semibold underline" href={page} data-testid="posting-document">
              {t("viewDocument")}
            </Link>
          ) : null}
          {state.document.journal_entry_id ? (
            <>
              {page ? " · " : null}
              <Link className="font-semibold underline" href={entryHref(state.document.journal_entry_id)} data-testid="posting-entries">
                {t("viewEntry")}
              </Link>
            </>
          ) : null}
        </Alert>
      );
    }
    case "checking":
      return (
        <Alert tone="info" data-testid="posting-checking">
          {t("checking")}
        </Alert>
      );
    case "notPosted":
      return (
        <Alert tone="info" data-testid="posting-not-posted">
          <p>{t("notPosted")}</p>
          <Button size="sm" className="mt-2" onClick={onRetry} data-testid="posting-retry">
            {t("retry")}
          </Button>
        </Alert>
      );
    case "processing":
      return (
        <Alert tone="info" data-testid="posting-processing">
          <p>{t("processing")}</p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={onCheck}>
            {t("checkAgain")}
          </Button>
        </Alert>
      );
    case "error":
      if (isClosedPeriod(state.error)) return <Alert data-testid="posting-period-closed">{t("periodClosed")}</Alert>;
      if (isSeparationOfDuties(state.error)) return <Alert data-testid="posting-separation">{tp("separation")}</Alert>;
      if (isRateOverrideForbidden(state.error)) return <Alert data-testid="posting-rate-override">{tp("rateOverride")}</Alert>;
      if (isMissingRate(state.error)) return <Alert data-testid="posting-missing-rate">{tp("missingRate")}</Alert>;
      return <FormError kind={errorKind(state.error)} detail={state.error.message} />;
    default:
      return null;
  }
}
