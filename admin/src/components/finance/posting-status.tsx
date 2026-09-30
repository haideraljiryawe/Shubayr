"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert, Button } from "@/components/ui";
import { FormError } from "@/components/forms/form-error";
import { errorKind } from "@/lib/api/errors";
import { documentHref, entryHref } from "@/lib/finance/links";
import { isClosedPeriod } from "@/lib/finance/operations";
import type { PostingState } from "./use-posting";

/** What happened to a posting, in words, with the next safe step. */
export function PostingStatus({
  state,
  onRetry,
  onCheck,
}: {
  state: PostingState;
  /** Retry with the SAME operation id — offered only once it is known safe. */
  onRetry: () => void;
  onCheck: () => void;
}) {
  const t = useTranslations("posting");
  switch (state.phase) {
    case "posted":
      return (
        <Alert tone="success" data-testid="posting-done">
          {t("posted", { number: state.document.document_number })}{" "}
          <Link className="font-semibold underline" href={documentHref(state.document.id)} data-testid="posting-document">
            {t("viewDocument")}
          </Link>
          {" · "}
          <Link className="font-semibold underline" href={entryHref(state.document.journal_entry_id)} data-testid="posting-entries">
            {t("viewEntry")}
          </Link>
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
      return isClosedPeriod(state.error) ? (
        <Alert data-testid="posting-period-closed">{t("periodClosed")}</Alert>
      ) : (
        <FormError kind={errorKind(state.error)} detail={state.error.message} />
      );
    default:
      return null;
  }
}
