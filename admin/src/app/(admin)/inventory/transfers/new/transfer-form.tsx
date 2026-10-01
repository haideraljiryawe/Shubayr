"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Alert, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Field } from "@/components/forms/field";
import { usePosting } from "@/components/finance/use-posting";
import { BalancePicker } from "@/components/inventory/balance-picker";
import { InventoryPostingStatus } from "@/components/inventory/inventory-posting-status";
import { browserApi, unwrap } from "@/lib/api/client";
import { storeDay } from "@/lib/finance/dates";
import { newOperationId } from "@/lib/finance/operations";
import {
  formatQuantity,
  lineKey,
  locationLabel,
  toMilli,
  type Balance,
  type LocationInfo,
  type Transfer,
  type Warehouse,
} from "@/lib/inventory";

interface Line {
  row: Balance;
  quantity: string | null;
  toLocationId: string;
}

/**
 * A stock transfer: pick lot/location balances (unreserved stock only), how
 * much of each to move and where. The lot travels with its identity — same
 * lot, new location — and the transfer has no ledger effect.
 */
export function TransferForm({
  warehouses,
  locations,
  canSearchSku,
}: {
  warehouses: Warehouse[];
  locations: Record<string, LocationInfo>;
  canSearchSku: boolean;
}) {
  const t = useTranslations("inventory");
  const locale = useLocale();
  const posting = usePosting<Transfer>();
  const [lines, setLines] = useState<Line[]>([]);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(storeDay());
  const [errors, setErrors] = useState<Record<string, Partial<Record<"quantity" | "to", string>>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [review, setReview] = useState<{ operationId: string } | null>(null);
  const posted = posting.state.phase === "posted";
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";
  const active = Object.values(locations).filter((info) => info.active);

  function patch(key: string, change: Partial<Line>) {
    setLines((current) => current.map((line) => (lineKey(line.row) === key ? { ...line, ...change } : line)));
    setErrors((current) => ({ ...current, [key]: {} }));
  }

  function toReview() {
    const found: typeof errors = {};
    for (const line of lines) {
      const key = lineKey(line.row);
      const e: Partial<Record<"quantity" | "to", string>> = {};
      if (!line.quantity || toMilli(line.quantity) <= 0) e.quantity = t("errors.quantity");
      else if (toMilli(line.quantity) > toMilli(line.row.available)) {
        e.quantity = t("errors.overAvailable", { available: formatQuantity(line.row.available, locale) });
      }
      if (!line.toLocationId) e.to = t("errors.destination");
      if (Object.keys(e).length) found[key] = e;
    }
    setErrors(found);
    let problem: string | null = null;
    if (lines.length === 0) problem = t("errors.noLines");
    else if (reason.trim().length < 3) problem = t("errors.reason");
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > storeDay()) problem = t("errors.future");
    setFormError(problem);
    if (Object.keys(found).length || problem) return;
    posting.reset();
    setReview({ operationId: newOperationId() });
  }

  async function confirm() {
    if (!review) return;
    await posting.post(review.operationId, () =>
      unwrap(
        browserApi.POST("/admin/inventory/transfers", {
          body: {
            operation_id: review.operationId,
            document_date: date,
            reason: reason.trim(),
            lines: lines.map((line) => ({
              batch_id: line.row.batch_id,
              from_location_id: line.row.location_id,
              to_location_id: line.toLocationId,
              quantity: line.quantity!,
            })),
          },
        }),
      ),
    );
  }

  function startOver() {
    setLines([]);
    setReason("");
    setReview(null);
    posting.reset();
  }

  if (review) {
    return (
      <Card className="flex flex-col gap-4" data-testid="transfer-preview">
        <h2 className="text-lg font-bold">{t("reviewTitle")}</h2>
        <table className="w-full text-sm">
          <thead className="text-text-muted">
            <tr>
              <th className="px-3 py-1 text-start font-semibold">{t("columns.sku")}</th>
              <th className="px-3 py-1 text-start font-semibold">{t("columns.lot")}</th>
              <th className="px-3 py-1 text-start font-semibold">{t("columns.from")}</th>
              <th className="px-3 py-1 text-start font-semibold">{t("columns.to")}</th>
              <th className="px-3 py-1 text-end font-semibold">{t("columns.quantity")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={lineKey(line.row)} className="border-t border-border">
                <td className="px-3 py-2 font-semibold" dir="ltr">{line.row.sku}</td>
                <td className="px-3 py-2" dir="ltr">{line.row.lot_number ?? t("noLotNumber")}</td>
                <td className="px-3 py-2" dir="ltr">{locationLabel(locations[line.row.location_id], line.row.location_code)}</td>
                <td className="px-3 py-2" dir="ltr">{locationLabel(locations[line.toLocationId])}</td>
                <td className="px-3 py-2 text-end" dir="ltr">{formatQuantity(line.quantity, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm text-text-muted">
          {reason} · {t("documentDateIs", { date })}
        </p>
        <InventoryPostingStatus state={posting.state} type="transfer" onRetry={() => void confirm()} onCheck={() => void posting.check(review.operationId)} />
        <div className="flex justify-end gap-2">
          {posted ? (
            <Button variant="secondary" onClick={startOver} data-testid="transfer-another">
              {t("another")}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setReview(null)} disabled={busy}>
                {t("edit")}
              </Button>
              <Button
                onClick={() => void confirm()}
                pending={busy}
                disabled={posting.state.phase === "notPosted" || posting.state.phase === "processing"}
                data-testid="transfer-confirm"
              >
                {t("transfer.post")}
              </Button>
            </>
          )}
        </div>
        {posting.state.phase === "error" ? <Alert tone="info">{t("fixAndReview")}</Alert> : null}
      </Card>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      data-testid="transfer-form"
      onSubmit={(event) => {
        event.preventDefault();
        toReview();
      }}
    >
      <Card className="flex flex-col gap-3">
        <h2 className="font-bold">{t("transfer.pickTitle")}</h2>
        <p className="text-sm text-text-muted">{t("transfer.pickHint")}</p>
        <BalancePicker
          warehouses={warehouses}
          locations={locations}
          mode="transfer"
          picked={new Set(lines.map((line) => lineKey(line.row)))}
          onPick={(row) => setLines((current) => [...current, { row, quantity: null, toLocationId: "" }])}
          canSearchSku={canSearchSku}
        />
      </Card>

      {lines.map((line) => {
        const key = lineKey(line.row);
        const e = errors[key] ?? {};
        return (
          <Card key={key} className="flex flex-col gap-3" data-testid="transfer-line" data-sku={line.row.sku}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <span className="font-semibold" dir="ltr">{line.row.sku}</span>
                <span className="text-text-muted"> · {t("lotLabel", { lot: line.row.lot_number ?? t("noLotNumber") })}</span>
                <span className="text-text-muted" dir="ltr"> · {locationLabel(locations[line.row.location_id], line.row.location_code)}</span>
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setLines((current) => current.filter((row) => lineKey(row.row) !== key))}
                aria-label={t("removeLine")}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label={t("columns.quantity")}
                name="quantity"
                error={e.quantity}
                hint={t("transfer.availableHint", { available: formatQuantity(line.row.available, locale), reserved: formatQuantity(line.row.reserved, locale) })}
              >
                <DecimalInput value={line.quantity ?? ""} parse={{ maxDecimals: 3 }} onValueChange={(quantity) => patch(key, { quantity })} data-testid="transfer-quantity" />
              </Field>
              <Field label={t("columns.to")} name="to" error={e.to}>
                <Select value={line.toLocationId} onChange={(event) => patch(key, { toLocationId: event.target.value })} data-testid="transfer-destination">
                  <option value="">{t("pickLocation")}</option>
                  {active
                    .filter((info) => info.id !== line.row.location_id)
                    .map((info) => (
                      <option key={info.id} value={info.id}>
                        {locationLabel(info)}
                        {info.sellable ? "" : ` (${t("nonSellable")})`}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
          </Card>
        );
      })}

      <Card className="grid gap-4 md:grid-cols-2">
        <Field label={t("columns.reason")} name="reason">
          <Textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} data-testid="transfer-reason" />
        </Field>
        <Field label={t("columns.documentDate")} name="document_date">
          <Input type="date" value={date} max={storeDay()} onChange={(event) => setDate(event.target.value)} data-testid="transfer-date" />
        </Field>
      </Card>
      {formError ? <Alert data-testid="transfer-form-error">{formError}</Alert> : null}
      <div className="flex justify-end">
        <Button type="submit" data-testid="transfer-review">
          {t("review")}
        </Button>
      </div>
    </form>
  );
}
