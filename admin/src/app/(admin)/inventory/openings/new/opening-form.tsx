"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Alert, Button, Card, Input, Select } from "@/components/ui";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Field } from "@/components/forms/field";
import { usePosting } from "@/components/finance/use-posting";
import { InventoryPostingStatus } from "@/components/inventory/inventory-posting-status";
import { SkuPicker, type PickedSku } from "@/components/inventory/sku-picker";
import { browserApi, unwrap } from "@/lib/api/client";
import { storeDay } from "@/lib/finance/dates";
import { newOperationId } from "@/lib/finance/operations";
import { formatCost, formatQuantity, fromMilli, locationLabel, quantityRule, toMilli, type LocationInfo, type Opening } from "@/lib/inventory";

interface Line {
  key: number;
  sku: PickedSku | null;
  locationId: string;
  quantity: string | null;
  unitCost: string | null;
  lotNumber: string;
  expiry: string;
}

type LineErrors = Partial<Record<"sku" | "location" | "quantity" | "unitCost" | "expiry", string>>;

/**
 * Opening stock as one numbered document: each line creates a lot (SKU,
 * location, quantity, unit cost, optional lot number and expiry). A piece
 * SKU takes whole units; a weighed or measured one up to three decimals.
 *
 * Review, then confirm: the operation id is fixed when the person reviews,
 * so a double click, or a retry after a lost answer, posts one document.
 */
export function OpeningForm({ locations, canSearchSku }: { locations: LocationInfo[]; canSearchSku: boolean }) {
  const t = useTranslations("inventory");
  const locale = useLocale();
  const posting = usePosting<Opening>();
  const nextKey = useRef(1);
  const blank = (key: number): Line => ({ key, sku: null, locationId: "", quantity: null, unitCost: null, lotNumber: "", expiry: "" });
  const [lines, setLines] = useState<Line[]>([blank(0)]);
  const [date, setDate] = useState(storeDay());
  const [backdateReason, setBackdateReason] = useState("");
  const [errors, setErrors] = useState<Record<number, LineErrors>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [review, setReview] = useState<{ operationId: string } | null>(null);
  const posted = posting.state.phase === "posted";
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";

  function patch(key: number, change: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)));
    setErrors((current) => ({ ...current, [key]: {} }));
  }

  function toReview() {
    const found: Record<number, LineErrors> = {};
    let value = 0;
    for (const line of lines) {
      const e: LineErrors = {};
      if (!line.sku) e.sku = t("errors.sku");
      if (!line.locationId) e.location = t("errors.location");
      if (!line.quantity || toMilli(line.quantity) <= 0) e.quantity = t("errors.quantity");
      else if (line.sku?.wholeUnitsOnly && !Number.isInteger(Number(line.quantity))) e.quantity = t("errors.wholeUnits");
      if (line.unitCost === null) e.unitCost = t("errors.unitCost");
      if (line.expiry && !/^\d{4}-\d{2}-\d{2}$/.test(line.expiry)) e.expiry = t("errors.date");
      if (Object.keys(e).length) found[line.key] = e;
      else value += Number(line.quantity) * Number(line.unitCost);
    }
    setErrors(found);
    let problem: string | null = null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problem = t("errors.date");
    else if (date > storeDay()) problem = t("errors.future");
    else if (Object.keys(found).length === 0 && !(value > 0)) problem = t("errors.openingValue");
    setFormError(problem);
    if (Object.keys(found).length || problem) return;
    posting.reset();
    // The document's identity is fixed here, before anything is sent.
    setReview({ operationId: newOperationId() });
  }

  async function confirm() {
    if (!review) return;
    await posting.post(review.operationId, () =>
      unwrap(
        browserApi.POST("/admin/inventory/openings", {
          body: {
            operation_id: review.operationId,
            document_date: date,
            ...(backdateReason.trim() ? { backdate_reason: backdateReason.trim() } : {}),
            lines: lines.map((line) => ({
              variant_id: line.sku!.variantId,
              location_id: line.locationId,
              quantity: line.quantity!,
              unit_cost_iqd: line.unitCost!,
              ...(line.lotNumber.trim() ? { lot_number: line.lotNumber.trim() } : {}),
              ...(line.expiry ? { expiry_date: line.expiry } : {}),
            })),
          },
        }),
      ),
    );
  }

  function startOver() {
    nextKey.current += 1;
    setLines([blank(nextKey.current)]);
    setReview(null);
    posting.reset();
  }

  const byId = new Map(locations.map((info) => [info.id, info]));

  if (review) {
    return (
      <Card className="flex flex-col gap-4" data-testid="opening-preview">
        <h2 className="text-lg font-bold">{t("reviewTitle")}</h2>
        <table className="w-full text-sm">
          <thead className="text-text-muted">
            <tr>
              <th className="px-3 py-1 text-start font-semibold">{t("columns.sku")}</th>
              <th className="px-3 py-1 text-start font-semibold">{t("columns.location")}</th>
              <th className="px-3 py-1 text-start font-semibold">{t("columns.lot")}</th>
              <th className="px-3 py-1 text-end font-semibold">{t("columns.quantity")}</th>
              <th className="px-3 py-1 text-end font-semibold">{t("columns.unitCost")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key} className="border-t border-border" data-testid="opening-preview-line">
                <td className="px-3 py-2 font-semibold" dir="ltr">{line.sku?.sku}</td>
                <td className="px-3 py-2" dir="ltr">{locationLabel(byId.get(line.locationId))}</td>
                <td className="px-3 py-2" dir="ltr">
                  {line.lotNumber || t("lotAutomatic")}
                  {line.expiry ? <span className="block text-xs text-text-muted">{t("expires", { date: line.expiry })}</span> : null}
                </td>
                <td className="px-3 py-2 text-end" dir="ltr">{formatQuantity(line.quantity, locale)} {line.sku?.baseUnit}</td>
                <td className="px-3 py-2 text-end" dir="ltr">{formatCost(line.unitCost, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm">
          {t("opening.value")}{" "}
          <span className="font-bold" dir="ltr" data-testid="opening-preview-value">
            {formatCost(
              fromMilli(lines.reduce((sum, line) => sum + Math.round(Number(line.quantity) * Number(line.unitCost) * 1000), 0)),
              locale,
            )}
          </span>
          <span className="text-text-muted"> · {t("documentDateIs", { date })}</span>
        </p>
        <InventoryPostingStatus state={posting.state} type="opening" onRetry={() => void confirm()} onCheck={() => void posting.check(review.operationId)} />
        <div className="flex justify-end gap-2">
          {posted ? (
            <Button variant="secondary" onClick={startOver} data-testid="opening-another">
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
                data-testid="opening-confirm"
              >
                {t("opening.post")}
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
      data-testid="opening-form"
      onSubmit={(event) => {
        event.preventDefault();
        toReview();
      }}
    >
      {canSearchSku ? null : <Alert tone="info">{t("skuPicker.needsCatalog")}</Alert>}
      {lines.map((line, index) => {
        const e = errors[line.key] ?? {};
        return (
          <Card key={line.key} className="flex flex-col gap-4" data-testid="opening-line">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">{t("lineNumber", { number: index + 1 })}</h2>
              {lines.length > 1 ? (
                <Button size="sm" variant="ghost" onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))} aria-label={t("removeLine")}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t("columns.sku")} name="sku" error={e.sku}>
                <div>
                  <SkuPicker value={line.sku} onChange={(sku) => patch(line.key, { sku })} testId="opening-sku" disabled={!canSearchSku} />
                </div>
              </Field>
              <Field label={t("columns.location")} name="location" error={e.location}>
                <Select value={line.locationId} onChange={(event) => patch(line.key, { locationId: event.target.value })} data-testid="opening-location">
                  <option value="">{t("pickLocation")}</option>
                  {locations.map((info) => (
                    <option key={info.id} value={info.id}>
                      {locationLabel(info)}
                      {info.sellable ? "" : ` (${t("nonSellable")})`}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                key={`qty-${line.sku?.variantId ?? "none"}`}
                label={line.sku ? t("quantityIn", { unit: line.sku.baseUnit }) : t("columns.quantity")}
                name="quantity"
                error={e.quantity}
                hint={line.sku ? (line.sku.wholeUnitsOnly ? t("wholeUnitsHint") : t("decimalHint")) : undefined}
              >
                <DecimalInput
                  value={line.quantity ?? ""}
                  parse={quantityRule(line.sku?.wholeUnitsOnly ?? true)}
                  onValueChange={(quantity) => patch(line.key, { quantity })}
                  data-testid="opening-quantity"
                />
              </Field>
              <Field label={t("unitCostIqd")} name="unitCost" error={e.unitCost}>
                <DecimalInput value={line.unitCost ?? ""} parse={{ maxDecimals: 4 }} onValueChange={(unitCost) => patch(line.key, { unitCost })} data-testid="opening-cost" />
              </Field>
              <Field label={t("lotNumberOptional")} name="lot_number" hint={t("lotNumberHint")}>
                <Input value={line.lotNumber} maxLength={80} dir="ltr" onChange={(event) => patch(line.key, { lotNumber: event.target.value })} data-testid="opening-lot" />
              </Field>
              <Field
                label={line.sku?.tracksExpiry ? t("expiryTracked") : t("expiryOptional")}
                name="expiry"
                error={e.expiry}
              >
                <Input type="date" value={line.expiry} onChange={(event) => patch(line.key, { expiry: event.target.value })} data-testid="opening-expiry" />
              </Field>
            </div>
          </Card>
        );
      })}
      <div>
        <Button
          variant="secondary"
          onClick={() => {
            nextKey.current += 1;
            setLines((current) => [...current, blank(nextKey.current)]);
          }}
          data-testid="opening-add-line"
        >
          <Plus className="size-4" aria-hidden />
          {t("addLine")}
        </Button>
      </div>
      <Card className="grid gap-4 md:grid-cols-2">
        <Field label={t("columns.documentDate")} name="document_date">
          <Input type="date" value={date} max={storeDay()} onChange={(event) => setDate(event.target.value)} data-testid="opening-date" />
        </Field>
        <Field label={t("backdateReason")} name="backdate_reason" hint={t("backdateHint")}>
          <Input value={backdateReason} onChange={(event) => setBackdateReason(event.target.value)} />
        </Field>
      </Card>
      {formError ? <Alert data-testid="opening-form-error">{formError}</Alert> : null}
      <div className="flex justify-end">
        <Button type="submit" data-testid="opening-review">
          {t("review")}
        </Button>
      </div>
    </form>
  );
}
