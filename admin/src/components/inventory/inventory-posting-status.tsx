"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert, Button } from "@/components/ui";
import { FormError } from "@/components/forms/form-error";
import type { PostingState } from "@/components/finance/use-posting";
import { errorKind } from "@/lib/api/errors";
import { entryHref } from "@/lib/finance/links";
import { isClosedPeriod } from "@/lib/finance/operations";
import { documentHref, isWholeUnitsError, type DocumentType } from "@/lib/inventory";

interface PostedDocument {
  id: string;
  document_number: string;
  journal_entry_id?: string | null;
}

/**
 * What happened to an inventory posting, with the next safe step — the
 * inventory twin of PostingStatus: same once-only states, but the links go
 * to the inventory document and (when it posted one) its journal entry.
 */
export function InventoryPostingStatus<T extends PostedDocument>({
  state,
  type,
  onRetry,
  onCheck,
}: {
  state: PostingState<T>;
  type: DocumentType;
  onRetry: () => void;
  onCheck: () => void;
}) {
  const t = useTranslations("posting");
  const ti = useTranslations("inventory");
  switch (state.phase) {
    case "posted":
      return (
        <Alert tone="success" data-testid="posting-done">
          {t("posted", { number: state.document.document_number })}{" "}
          <Link className="font-semibold underline" href={documentHref(type, state.document.id)} data-testid="posting-document">
            {t("viewDocument")}
          </Link>
          {state.document.journal_entry_id ? (
            <>
              {" · "}
              <Link className="font-semibold underline" href={entryHref(state.document.journal_entry_id)} data-testid="posting-entries">
                {t("viewEntry")}
              </Link>
            </>
          ) : null}
        </Alert>
      );
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
      if (isWholeUnitsError(state.error)) return <Alert data-testid="posting-whole-units">{ti("errors.wholeUnits")}</Alert>;
      return <FormError kind={errorKind(state.error)} detail={state.error.message} />;
    default:
      return null;
  }
}
