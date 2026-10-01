"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Badge, Button, Card, Textarea } from "@/components/ui";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Field } from "@/components/forms/field";
import { usePosting } from "@/components/finance/use-posting";
import { DocumentDateFields, documentDateError, type DocumentDateValue } from "@/components/purchasing/document-date";
import { PurchasingPostingStatus } from "@/components/purchasing/posting-status";
import { browserApi, unwrap } from "@/lib/api/client";
import { newOperationId } from "@/lib/finance/operations";
import { formatQuantity, locationLabel, lotHref, toMilli, type Balance, type LocationInfo } from "@/lib/inventory";
import { fixedText, moneyText, precisionOf, returnPreview, toFixed, type PurchaseInvoice } from "@/lib/purchasing";

interface Posted {
  id: string;
  document_number: string;
  journal_entry_id: string;
  total_currency: number;
  total_iqd: number;
  credits?: Array<{ amount_currency: number; currency_code: string }>;
}

export function ReturnForm({
  invoice,
  balances,
  locations,
  supplierBalance,
  permissions,
  today,
  windowDays,
}: {
  invoice: PurchaseInvoice;
  /** By purchase item: the lot's balances per location (null without inventory.view). */
  balances: Record<string, Balance[] | null>;
  locations: Record<string, LocationInfo>;
  supplierBalance: string | null;
  permissions: string[];
  today: string;
  windowDays: number;
}) {
  const t = useTranslations("purchasing.return");
  const locale = useLocale();
  const posting = usePosting<Posted>();
  const canCost = permissions.includes("cost.view");
  const currency = invoice.currency_code;
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [date, setDate] = useState<DocumentDateValue>({ date: today, backdateReason: "" });
  const [showErrors, setShowErrors] = useState(false);
  const [review, setReview] = useState<{ operationId: string } | null>(null);
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";
  const locked = review !== null;

  const rows = (invoice.items ?? []).flatMap((item) =>
    (balances[item.id] ?? []).map((balance) => ({ item, balance, key: `${item.id}:${balance.location_id}` })),
  );
  const chosen = rows
    .map((row) => ({ ...row, quantity: toFixed(quantities[row.key] || "0") }))
    .filter((row) => row.quantity > 0n);
  const preview =
    canCost && invoice.exchange_rate !== undefined
      ? returnPreview({
          lines: chosen.map((row) => ({ quantity: row.quantity, lotCostIqd: toFixed(row.item.lot?.purchase_cost ?? 0) })),
          invoiceRate: toFixed(invoice.exchange_rate),
          supplierBalance: toFixed(supplierBalance ?? "0"),
        })
      : null;

  const problems: string[] = [];
  if (chosen.length === 0) problems.push(t("errors.noLines"));
  for (const row of chosen) {
    if (row.quantity > toFixed(row.balance.available)) problems.push(t("errors.overAvailable", { sku: row.item.variant?.sku ?? "", available: formatQuantity(row.balance.available, locale) }));
    if (row.item.variant?.whole_units_only && row.quantity % 10n ** 12n !== 0n) problems.push(t("errors.wholeUnits", { sku: row.item.variant.sku }));
  }
  if (reason.trim().length < 3) problems.push(t("errors.reason"));
  if (documentDateError(date, today, windowDays, permissions.includes("backdate.approve"))) problems.push(t("errors.date"));

  function toReview() {
    setShowErrors(true);
    if (problems.length) return;
    posting.reset();
    setReview({ operationId: newOperationId() });
  }

  async function confirm() {
    if (!review) return;
    await posting.post(review.operationId, async () =>
      (await unwrap(
        browserApi.POST("/admin/supplier-returns", {
          body: {
            operation_id: review.operationId,
            document_date: date.date,
            ...(date.backdateReason.trim() ? { backdate_reason: date.backdateReason.trim() } : {}),
            supplier_id: invoice.supplier_id,
            invoice_id: invoice.id,
            reason: reason.trim(),
            lines: chosen.map((row) => ({
              purchase_item_id: row.item.id,
              batch_id: row.item.lot_id!,
              location_id: row.balance.location_id,
              quantity: fixedText(row.quantity, 3),
            })),
          },
        }),
      )) as unknown as Posted,
    );
  }

  const money = (value: bigint, code: string) => moneyText(value, code, precisionOf(code), locale);
  const posted = posting.state.phase === "posted" ? posting.state.document : null;
  const missingBalances = Object.values(balances).some((value) => value === null);

  return (
    <div className="flex flex-col gap-6" data-testid="return-form">
      <Card className="overflow-x-auto">
        <h2 className="mb-1 text-lg font-bold">{t("lots")}</h2>
        <p className="mb-3 text-sm text-text-muted">{t("lotsBody")}</p>
        {missingBalances ? <Alert tone="info">{t("needsInventory")}</Alert> : null}
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="text-text-muted">
            <tr>
              <th className="px-3 py-2 text-start font-semibold">{t("columns.sku")}</th>
              <th className="px-3 py-2 text-start font-semibold">{t("columns.lot")}</th>
              <th className="px-3 py-2 text-start font-semibold">{t("columns.location")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("columns.onHand")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("columns.reserved")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("columns.available")}</th>
              <th className="w-36 px-3 py-2 text-start font-semibold">{t("columns.return")}</th>
              {canCost ? <th className="px-3 py-2 text-end font-semibold">{t("columns.lotCost")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-border" data-testid="return-row" data-sku={row.item.variant?.sku ?? ""} data-location={row.balance.location_code}>
                <td className="px-3 py-2 font-semibold" dir="ltr">{row.item.variant?.sku ?? row.balance.sku}</td>
                <td className="px-3 py-2">
                  {row.item.lot_id ? (
                    <Link href={lotHref(row.item.lot_id)} className="text-primary-dark hover:underline" dir="ltr">
                      {row.item.lot_number ?? t("noLotNumber")}
                    </Link>
                  ) : null}
                </td>
                <td className="px-3 py-2" dir="ltr">{locationLabel(locations[row.balance.location_id], row.balance.location_code)}</td>
                <td className="px-3 py-2 text-end" dir="ltr">{formatQuantity(row.balance.quantity, locale)}</td>
                <td className="px-3 py-2 text-end" dir="ltr">{formatQuantity(row.balance.reserved, locale)}</td>
                <td className="px-3 py-2 text-end font-semibold" dir="ltr" data-testid="return-available">{formatQuantity(row.balance.available, locale)}</td>
                <td className="px-3 py-2">
                  {toMilli(row.balance.available) > 0 ? (
                    <DecimalInput
                      value={quantities[row.key] ?? ""}
                      parse={{ maxDecimals: row.item.variant?.whole_units_only ? 0 : 3 }}
                      className="h-9"
                      disabled={locked}
                      onValueChange={(_, text) => setQuantities((current) => ({ ...current, [row.key]: text.trim() }))}
                      data-testid="return-quantity"
                    />
                  ) : (
                    <Badge tone="warning" data-testid="return-blocked">
                      {toMilli(row.balance.reserved) > 0 ? t("allReserved") : t("nothingHere")}
                    </Badge>
                  )}
                </td>
                {canCost ? (
                  <td className="px-3 py-2 text-end" dir="ltr">{money(toFixed(row.item.lot?.purchase_cost ?? 0), "IQD")}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="flex flex-col gap-3" data-testid="return-effect">
        <h2 className="text-lg font-bold">{t("effect")}</h2>
        {preview ? (
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Tile label={t("valueIqd")} value={money(preview.totalIqd, "IQD")} testId="return-value-iqd" />
            <Tile label={t("valueIn", { currency })} value={money(preview.totalCurrency, currency)} testId="return-value" />
            <Tile label={t("payableAfter")} value={supplierBalance === null ? t("unknown") : money(preview.balanceAfter > 0n ? preview.balanceAfter : 0n, currency)} testId="return-payable-after" />
            <Tile label={t("creditAfter")} value={money(preview.credit, currency)} testId="return-credit" />
          </dl>
        ) : (
          <p className="text-sm text-text-muted">{t("valuedAtPosting")}</p>
        )}
      </Card>

      <Card className="grid gap-4 md:grid-cols-2">
        <Field label={t("reason")} name="reason">
          <Textarea value={reason} maxLength={500} disabled={locked} onChange={(event) => setReason(event.target.value)} data-testid="return-reason" />
        </Field>
        <div className="flex flex-col gap-4">
          <DocumentDateFields value={date} onChange={setDate} today={today} windowDays={windowDays} canBackdate={permissions.includes("backdate.approve")} showErrors={showErrors} disabled={locked} testId="return" />
        </div>
      </Card>

      {showErrors && problems.length ? (
        <Alert data-testid="return-problems">
          <ul className="list-inside list-disc">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {review ? (
        <Card className="flex flex-col gap-3" data-testid="return-review">
          <PurchasingPostingStatus state={posting.state} onRetry={() => void confirm()} onCheck={() => void posting.check(review.operationId)} />
          {posted ? (
            <p className="text-sm" data-testid="return-posted">
              {t("postedSummary", {
                value: money(toFixed(posted.total_currency), currency),
                credit: money((posted.credits ?? []).reduce((sum, credit) => sum + toFixed(credit.amount_currency), 0n), currency),
              })}
            </p>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReview(null)} disabled={busy}>
                {t("edit")}
              </Button>
              <Button onClick={() => void confirm()} pending={busy} disabled={posting.state.phase === "notPosted" || posting.state.phase === "processing"} data-testid="return-confirm">
                {t("post")}
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="flex justify-end">
          <Button onClick={toReview} data-testid="return-review-button">
            {t("review")}
          </Button>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-md bg-card p-3">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="font-bold" dir="ltr" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
