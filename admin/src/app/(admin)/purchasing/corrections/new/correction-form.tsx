"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Button, Card, Select, Textarea } from "@/components/ui";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Field } from "@/components/forms/field";
import { usePosting } from "@/components/finance/use-posting";
import { DocumentDateFields, documentDateError, type DocumentDateValue } from "@/components/purchasing/document-date";
import { PurchasingPostingStatus } from "@/components/purchasing/posting-status";
import { browserApi, unwrap } from "@/lib/api/client";
import { newOperationId } from "@/lib/finance/operations";
import {
  correctionSplit,
  fixedText,
  moneyText,
  toFixed,
  unitDifferences,
  type AllocationMethod,
  type PurchaseInvoice,
} from "@/lib/purchasing";

export interface LotFacts {
  warehouse: string;
  custody: string;
  returned: string;
  /** False when the lot has more movements than were read. */
  complete: boolean;
}

type Kind = "late_landed_cost" | "cost_correction";

interface Posted {
  id: string;
  document_number: string;
  journal_entry_id: string;
  amount_iqd: number;
  inventory_iqd: number;
  custody_iqd: number;
  cogs_iqd: number;
}

export function CorrectionForm({
  invoice,
  facts,
  permissions,
  today,
  windowDays,
}: {
  invoice: PurchaseInvoice;
  facts: Record<string, LotFacts> | null;
  permissions: string[];
  today: string;
  windowDays: number;
}) {
  const t = useTranslations("purchasing.correction");
  const locale = useLocale();
  const router = useRouter();
  const posting = usePosting<Posted>();
  const canCost = permissions.includes("cost.view");
  const items = useMemo(() => invoice.items ?? [], [invoice.items]);
  const [kind, setKind] = useState<Kind>("late_landed_cost");
  const [method, setMethod] = useState<AllocationMethod>(canCost ? "value" : "quantity");
  const [total, setTotal] = useState("");
  const [manual, setManual] = useState<Record<string, string>>({});
  const [unitInputs, setUnitInputs] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [date, setDate] = useState<DocumentDateValue>({ date: today, backdateReason: "" });
  const [showErrors, setShowErrors] = useState(false);
  const [review, setReview] = useState<{ operationId: string } | null>(null);
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";
  const iqd = (value: bigint) => moneyText(value, "IQD", 0, locale);

  /** Per-line unit difference (IQD per base unit), from the total or as typed. */
  const units = useMemo(() => {
    if (kind === "cost_correction") return { error: null, shares: null, units: items.map((item) => toFixed(unitInputs[item.id] || "0")) };
    const lines = items.map((item) => ({
      value: toFixed(item.line_total_currency ?? 0),
      quantity: toFixed(item.quantity),
      manual: toFixed(manual[item.id] || "0"),
    }));
    return unitDifferences(lines, toFixed(total || "0"), method);
  }, [kind, items, unitInputs, manual, total, method]);

  const split = useMemo(() => {
    if (!facts) return null;
    const lines = items
      .map((item, index) => ({ item, unit: units.units[index] ?? 0n }))
      .filter(({ item }) => facts[item.id])
      .map(({ item, unit }) => ({
        purchaseItemId: item.id,
        received: toFixed(item.quantity),
        warehouse: toFixed(facts[item.id]!.warehouse),
        custody: toFixed(facts[item.id]!.custody),
        returned: toFixed(facts[item.id]!.returned),
        unitDifference: unit,
      }));
    return correctionSplit(lines);
  }, [facts, items, units]);

  const sendLines = items
    .map((item, index) => ({ purchase_item_id: item.id, unit: units.units[index] ?? 0n }))
    .filter((line) => line.unit !== 0n);

  const problems: string[] = [];
  if (kind === "late_landed_cost" && toFixed(total || "0") <= 0n) problems.push(t("errors.total"));
  if (units.error) problems.push(t(`errors.${units.error}`));
  if (sendLines.length === 0) problems.push(t("errors.noLines"));
  if (kind === "late_landed_cost" && sendLines.some((line) => line.unit < 0n)) problems.push(t("errors.negativeLanded"));
  if (reason.trim().length < 3) problems.push(t("errors.reason"));
  if (documentDateError(date, today, windowDays, permissions.includes("backdate.approve"))) problems.push(t("errors.date"));
  if (split?.rows.some((row) => row.inconsistent)) problems.push(t("errors.inconsistent"));

  function toReview() {
    setShowErrors(true);
    if (problems.length) return;
    posting.reset();
    setReview({ operationId: newOperationId() });
  }

  async function confirm() {
    if (!review) return;
    const state = await posting.post(review.operationId, async () =>
      (await unwrap(
        browserApi.POST("/admin/purchase-cost-corrections", {
          body: {
            operation_id: review.operationId,
            document_date: date.date,
            ...(date.backdateReason.trim() ? { backdate_reason: date.backdateReason.trim() } : {}),
            invoice_id: invoice.id,
            kind,
            allocation_method: kind === "late_landed_cost" ? method : "manual",
            reason: reason.trim(),
            lines: sendLines.map((line) => ({ purchase_item_id: line.purchase_item_id, unit_difference_iqd: fixedText(line.unit, 12) })),
          },
        }),
      )) as unknown as Posted,
    );
    if (state?.phase === "posted") router.refresh();
  }

  const posted = posting.state.phase === "posted" ? posting.state.document : null;

  return (
    <div className="flex flex-col gap-6" data-testid="correction-form">
      <Card className="grid gap-4 md:grid-cols-3">
        <Field label={t("kind")} name="kind">
          <Select value={kind} disabled={review !== null} onChange={(event) => setKind(event.target.value as Kind)} data-testid="correction-kind">
            <option value="late_landed_cost">{t("kinds.late_landed_cost")}</option>
            <option value="cost_correction">{t("kinds.cost_correction")}</option>
          </Select>
        </Field>
        {kind === "late_landed_cost" ? (
          <>
            <Field label={t("totalIqd")} name="total" hint={t("totalHint")}>
              <DecimalInput value={total} parse={{ maxDecimals: 4 }} disabled={review !== null} onValueChange={(_, text) => setTotal(text.trim())} data-testid="correction-total" />
            </Field>
            <Field label={t("method")} name="allocation_method" hint={canCost ? undefined : t("valueNeedsCost")}>
              <Select value={method} disabled={review !== null} onChange={(event) => setMethod(event.target.value as AllocationMethod)} data-testid="correction-method">
                {canCost ? <option value="value">{t("methods.value")}</option> : null}
                <option value="quantity">{t("methods.quantity")}</option>
                <option value="manual">{t("methods.manual")}</option>
              </Select>
            </Field>
          </>
        ) : (
          <p className="text-sm text-text-muted md:col-span-2">{t("correctionHint")}</p>
        )}
        <DocumentDateFields
          value={date}
          onChange={setDate}
          today={today}
          windowDays={windowDays}
          canBackdate={permissions.includes("backdate.approve")}
          showErrors={showErrors}
          disabled={review !== null}
          testId="correction"
        />
        <div className="md:col-span-2">
          <Field label={t("reason")} name="reason">
            <Textarea value={reason} maxLength={500} disabled={review !== null} onChange={(event) => setReason(event.target.value)} data-testid="correction-reason" />
          </Field>
        </div>
      </Card>

      <Card className="overflow-x-auto" data-testid="correction-preview">
        <h2 className="mb-1 text-lg font-bold">{t("splitTitle")}</h2>
        <p className="mb-3 text-sm text-text-muted">{t("splitBody")}</p>
        {!facts ? <Alert tone="info" data-testid="correction-no-preview">{t("previewNeedsInventory")}</Alert> : null}
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="text-text-muted">
            <tr>
              <th className="px-3 py-2 text-start font-semibold">{t("columns.sku")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("columns.received")}</th>
              {kind === "late_landed_cost" && method === "manual" ? <th className="px-3 py-2 text-end font-semibold">{t("columns.manualShare")}</th> : null}
              <th className="px-3 py-2 text-end font-semibold">{t("columns.unitDifference")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("columns.inStock")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("columns.inCustody")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("columns.sold")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("columns.stockValue")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("columns.custodyValue")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("columns.cogsValue")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const row = split?.rows.find((entry) => entry.purchaseItemId === item.id);
              return (
                <tr key={item.id} className="border-t border-border" data-testid="correction-line" data-sku={item.variant?.sku ?? ""}>
                  <td className="px-3 py-2 font-semibold" dir="ltr">{item.variant?.sku ?? item.variant_id.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-end" dir="ltr">{fixedText(toFixed(item.quantity), 3)}</td>
                  {kind === "late_landed_cost" && method === "manual" ? (
                    <td className="px-3 py-2 text-end">
                      <DecimalInput value={manual[item.id] ?? ""} parse={{ maxDecimals: 4 }} className="h-9 w-32" disabled={review !== null} onValueChange={(_, text) => setManual((current) => ({ ...current, [item.id]: text.trim() }))} data-testid="correction-manual" />
                    </td>
                  ) : null}
                  <td className="px-3 py-2 text-end" dir="ltr">
                    {kind === "cost_correction" ? (
                      <DecimalInput
                        value={unitInputs[item.id] ?? ""}
                        parse={{ maxDecimals: 6, allowNegative: true }}
                        className="h-9 w-32"
                        disabled={review !== null}
                        onValueChange={(_, text) => setUnitInputs((current) => ({ ...current, [item.id]: text.trim() }))}
                        data-testid="correction-unit"
                      />
                    ) : (
                      <span data-testid="correction-unit-value">{fixedText(units.units[index] ?? 0n, 4)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-end" dir="ltr" data-testid="split-stock-qty">{row ? fixedText(row.warehouse, 3) : "—"}</td>
                  <td className="px-3 py-2 text-end" dir="ltr" data-testid="split-custody-qty">{row ? fixedText(row.custody, 3) : "—"}</td>
                  <td className="px-3 py-2 text-end" dir="ltr" data-testid="split-sold-qty">{row ? fixedText(row.sold, 3) : "—"}</td>
                  <td className="px-3 py-2 text-end" dir="ltr">{row ? iqd(row.inventoryIqd) : "—"}</td>
                  <td className="px-3 py-2 text-end" dir="ltr">{row ? iqd(row.custodyIqd) : "—"}</td>
                  <td className="px-3 py-2 text-end" dir="ltr">{row ? iqd(row.cogsIqd) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {split ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Tile label={t("totals.stock")} value={iqd(split.inventoryIqd)} testId="split-stock" />
            <Tile label={t("totals.custody")} value={iqd(split.custodyIqd)} testId="split-custody" />
            <Tile label={t("totals.sold")} value={iqd(split.cogsIqd)} testId="split-sold" />
            <Tile label={t("totals.total")} value={iqd(split.totalIqd)} testId="split-total" />
          </dl>
        ) : null}
        {facts && Object.values(facts).some((fact) => !fact.complete) ? <p className="mt-2 text-xs text-warning-dark">{t("partialHistory")}</p> : null}
      </Card>

      {showErrors && problems.length ? (
        <Alert data-testid="correction-problems">
          <ul className="list-inside list-disc">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {review ? (
        <Card className="flex flex-col gap-3" data-testid="correction-review">
          <PurchasingPostingStatus state={posting.state} onRetry={() => void confirm()} onCheck={() => void posting.check(review.operationId)} />
          {posted ? (
            <p className="text-sm" data-testid="correction-posted-split">
              {t("postedSplit", { stock: iqd(toFixed(posted.inventory_iqd)), custody: iqd(toFixed(posted.custody_iqd)), sold: iqd(toFixed(posted.cogs_iqd)) })}
            </p>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReview(null)} disabled={busy}>
                {t("edit")}
              </Button>
              <Button onClick={() => void confirm()} pending={busy} disabled={posting.state.phase === "notPosted" || posting.state.phase === "processing"} data-testid="correction-confirm">
                {t("post")}
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="flex justify-end">
          <Button onClick={toReview} data-testid="correction-review-button">
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
