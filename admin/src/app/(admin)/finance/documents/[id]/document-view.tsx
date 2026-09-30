"use client";

import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Card, PageHeader } from "@/components/ui";
import { entryHref } from "@/lib/finance/links";
import { formatAmount } from "@/lib/finance/money";
import type { FinancialDocument } from "@/lib/finance/operations";

export function DocumentView({
  document,
  precision,
  canViewLedger,
}: {
  document: FinancialDocument;
  precision: number;
  canViewLedger: boolean;
}) {
  const t = useTranslations("documents");
  const locale = useLocale();
  const format = useFormatter();
  const day = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", numberingSystem: "latn", timeZone: "UTC" });
  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" });

  return (
    <div className="flex flex-col gap-4" data-testid="document-view" data-type={document.document_type}>
      <PageHeader
        title={<span dir="ltr" data-testid="document-number">{document.document_number}</span>}
        description={t(`type.${document.document_type}`)}
        actions={
          <Link className="text-sm text-primary-dark hover:underline" href="/finance/cash-accounts">
            {t("cashAccounts")}
          </Link>
        }
      />
      <Card className="p-4">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Fact label={t("amount")}>
            <span dir="ltr" data-testid="document-amount">
              {formatAmount(document.amount, document.currency_code, precision, locale)}
            </span>
          </Fact>
          {document.document_type === "cash_opening_balance" ? (
            <Fact label={t("account")}>
              <span data-testid="document-account">{document.cash_account.name}</span>
            </Fact>
          ) : (
            <>
              <Fact label={t("from")}>
                <span data-testid="document-from">{document.from_account.name}</span>
              </Fact>
              <Fact label={t("to")}>
                <span data-testid="document-to">{document.to_account.name}</span>
              </Fact>
              <Fact label={t("reason")}>{document.reason}</Fact>
            </>
          )}
          <Fact label={t("documentDate")}>{day(document.document_date)}</Fact>
          <Fact label={t("accountingDate")}>{day(document.accounting_date)}</Fact>
          {document.backdate_reason ? <Fact label={t("backdateReason")}>{document.backdate_reason}</Fact> : null}
          <Fact label={t("createdAt")}>{when(document.created_at)}</Fact>
        </dl>
        <div className="mt-4 border-t border-border pt-3 text-sm">
          {canViewLedger ? (
            <Link className="font-semibold text-primary-dark hover:underline" href={entryHref(document.journal_entry_id)} data-testid="document-entry">
              {t("viewEntry")}
            </Link>
          ) : (
            <p className="text-text-muted" data-testid="document-entry-hidden">{t("entryNeedsLedger")}</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
