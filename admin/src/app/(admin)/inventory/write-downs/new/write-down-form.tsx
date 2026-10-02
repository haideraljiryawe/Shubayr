"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
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
  writeDownNeedsMove,
  type Balance,
  type LocationInfo,
  type Transfer,
  type Warehouse,
  type WriteDown,
} from "@/lib/inventory";

interface Line {
  row: Balance;
  quantity: string | null;
  /** Where damaged stock on a sellable shelf is moved before the write-down. */
  moveToId: string;
}

/** The location a line is written down FROM: where it is, or where it was moved. */
function writeDownLocation(line: Line): string {
  return writeDownNeedsMove(line.row) ? line.moveToId : line.row.location_id;
}

/**
 * A write-down posts only from a non-sellable location (the API refuses
 * otherwise). Stock already in one is written down directly; stock on a
 * sellable shelf is first moved to a non-sellable location by a transfer —
 * its own numbered document — and then written down from there, and the
 * loss is posted (Dr 5010 Inventory loss / Cr 1000 Inventory).
 *
 * Both documents get their operation ids at review, so each posts once
 * however often confirm is pressed; if the transfer posted and the
 * write-down did not, confirming again posts only the write-down.
 */
export function WriteDownForm({
  warehouses,
  locations,
  canSearchSku,
  canTransfer,
}: {
  warehouses: Warehouse[];
  locations: Record<string, LocationInfo>;
  canSearchSku: boolean;
  canTransfer: boolean;
}) {
  const t = useTranslations("inventory");
  const locale = useLocale();
  const move = usePosting<Transfer>();
  const writeDown = usePosting<WriteDown>();
  const [lines, setLines] = useState<Line[]>([]);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(storeDay());
  const [backdateReason, setBackdateReason] = useState("");
  const [errors, setErrors] = useState<Record<string, Partial<Record<"quantity" | "move", string>>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [review, setReview] = useState<{ moveId: string; writeDownId: string } | null>(null);
  const quarantine = Object.values(locations).filter((info) => info.active && !info.sellable);
  const moving = lines.filter((line) => writeDownNeedsMove(line.row));
  const busy = [move.state.phase, writeDown.state.phase].some((phase) => phase === "posting" || phase === "checking");
  const done = writeDown.state.phase === "posted";

  function patch(key: string, change: Partial<Line>) {
    setLines((current) => current.map((line) => (lineKey(line.row) === key ? { ...line, ...change } : line)));
    setErrors((current) => ({ ...current, [key]: {} }));
  }

  /** Most that can go: unreserved stock if it has to move first, else what is on hand. */
  const limit = (row: Balance) => (writeDownNeedsMove(row) ? row.available : row.quantity);

  function toReview() {
    const found: typeof errors = {};
    for (const line of lines) {
      const key = lineKey(line.row);
      const e: Partial<Record<"quantity" | "move", string>> = {};
      if (!line.quantity || toMilli(line.quantity) <= 0) e.quantity = t("errors.quantity");
      else if (toMilli(line.quantity) > toMilli(limit(line.row))) {
        e.quantity = t("errors.overAvailable", { available: formatQuantity(limit(line.row), locale) });
      }
      if (writeDownNeedsMove(line.row) && !line.moveToId) e.move = canTransfer ? t("errors.quarantine") : t("writeDown.needsTransferPermission");
      if (Object.keys(e).length) found[key] = e;
    }
    setErrors(found);
    let problem: string | null = null;
    if (lines.length === 0) problem = t("errors.noLines");
    else if (reason.trim().length < 3) problem = t("errors.reason");
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > storeDay()) problem = t("errors.future");
    setFormError(problem);
    if (Object.keys(found).length || problem) return;
    move.reset();
    writeDown.reset();
    setReview({ moveId: newOperationId(), writeDownId: newOperationId() });
  }

  async function postWriteDown(operationId: string) {
    await writeDown.post(operationId, () =>
      unwrap(
        browserApi.POST("/admin/inventory/write-downs", {
          body: {
            operation_id: operationId,
            document_date: date,
            reason: reason.trim(),
            ...(backdateReason.trim() ? { backdate_reason: backdateReason.trim() } : {}),
            lines: lines.map((line) => ({
              batch_id: line.row.batch_id,
              location_id: writeDownLocation(line),
              quantity: line.quantity!,
            })),
          },
        }),
      ),
    );
  }

  async function confirm() {
    if (!review) return;
    if (moving.length && move.state.phase !== "posted") {
      const moved = await move.post(review.moveId, () =>
        unwrap(
          browserApi.POST("/admin/inventory/transfers", {
            body: {
              operation_id: review.moveId,
              document_date: date,
              reason: t("writeDown.moveReason", { reason: reason.trim() }).slice(0, 500),
              lines: moving.map((line) => ({
                batch_id: line.row.batch_id,
                from_location_id: line.row.location_id,
                to_location_id: line.moveToId,
                quantity: line.quantity!,
              })),
            },
          }),
        ),
      );
      if (moved?.phase !== "posted") return;
    }
    await postWriteDown(review.writeDownId);
  }

  function startOver() {
    setLines([]);
    setReason("");
    setReview(null);
    move.reset();
    writeDown.reset();
  }

  if (review) {
    return (
      <Card className="flex flex-col gap-4" data-testid="write-down-preview">
        <h2 className="text-lg font-bold">{t("reviewTitle")}</h2>
        {moving.length ? (
          <Alert tone="info" data-testid="write-down-two-steps">
            {t("writeDown.twoSteps", { count: moving.length })}
          </Alert>
        ) : null}
        <table className="w-full text-sm">
          <thead className="text-text-muted">
            <tr>
              <th className="px-3 py-1 text-start font-semibold">{t("columns.sku")}</th>
              <th className="px-3 py-1 text-start font-semibold">{t("columns.lot")}</th>
              <th className="px-3 py-1 text-start font-semibold">{t("columns.location")}</th>
              <th className="px-3 py-1 text-end font-semibold">{t("columns.quantity")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={lineKey(line.row)} className="border-t border-border">
                <td className="px-3 py-2 font-semibold" dir="ltr">{line.row.sku}</td>
                <td className="px-3 py-2" dir="ltr">{line.row.lot_number ?? t("noLotNumber")}</td>
                <td className="px-3 py-2" dir="ltr">
                  {writeDownNeedsMove(line.row)
                    ? `${locationLabel(locations[line.row.location_id], line.row.location_code)} → ${locationLabel(locations[line.moveToId])}`
                    : locationLabel(locations[line.row.location_id], line.row.location_code)}
                </td>
                <td className="px-3 py-2 text-end" dir="ltr">{formatQuantity(line.quantity, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm text-text-muted">
          {reason} · {t("documentDateIs", { date })}
        </p>
        {moving.length ? (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-text-muted">{t("writeDown.stepMove")}</p>
            <InventoryPostingStatus state={move.state} type="transfer" onRetry={() => void confirm()} onCheck={() => void move.check(review.moveId)} />
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          {moving.length ? <p className="text-xs font-semibold text-text-muted">{t("writeDown.stepWriteDown")}</p> : null}
          <InventoryPostingStatus
            state={writeDown.state}
            type="write_down"
            onRetry={() => void postWriteDown(review.writeDownId)}
            onCheck={() => void writeDown.check(review.writeDownId)}
          />
        </div>
        <div className="flex justify-end gap-2">
          {done ? (
            <Button variant="secondary" onClick={startOver} data-testid="write-down-another">
              {t("another")}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setReview(null)} disabled={busy || move.state.phase === "posted"}>
                {t("edit")}
              </Button>
              <Button
                onClick={() => void confirm()}
                pending={busy}
                disabled={[move.state.phase, writeDown.state.phase].some((phase) => phase === "notPosted" || phase === "processing")}
                data-testid="write-down-confirm"
              >
                {move.state.phase === "posted" ? t("writeDown.postRemaining") : t("writeDown.post")}
              </Button>
            </>
          )}
        </div>
        {writeDown.state.phase === "error" || move.state.phase === "error" ? (
          <Alert tone="info">{move.state.phase === "posted" ? t("writeDown.movedAlready") : t("fixAndReview")}</Alert>
        ) : null}
      </Card>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      data-testid="write-down-form"
      onSubmit={(event) => {
        event.preventDefault();
        toReview();
      }}
    >
      <Card className="flex flex-col gap-3">
        <h2 className="font-bold">{t("writeDown.pickTitle")}</h2>
        <p className="text-sm text-text-muted">{t("writeDown.pickHint")}</p>
        <BalancePicker
          warehouses={warehouses}
          locations={locations}
          mode="writeDown"
          picked={new Set(lines.map((line) => lineKey(line.row)))}
          onPick={(row) => setLines((current) => [...current, { row, quantity: null, moveToId: "" }])}
          canSearchSku={canSearchSku}
        />
      </Card>

      {lines.map((line) => {
        const key = lineKey(line.row);
        const e = errors[key] ?? {};
        const needsMove = writeDownNeedsMove(line.row);
        return (
          <Card key={key} className="flex flex-col gap-3" data-testid="write-down-line" data-sku={line.row.sku}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold" dir="ltr">{line.row.sku}</span>
                <span className="text-text-muted">{t("lotLabel", { lot: line.row.lot_number ?? t("noLotNumber") })}</span>
                <span className="text-text-muted" dir="ltr">{locationLabel(locations[line.row.location_id], line.row.location_code)}</span>
                {needsMove ? <Badge tone="warning">{t("writeDown.onSellableShelf")}</Badge> : <Badge>{t("nonSellable")}</Badge>}
              </p>
              <Button size="sm" variant="ghost" onClick={() => setLines((current) => current.filter((row) => lineKey(row.row) !== key))} aria-label={t("removeLine")}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label={t("columns.quantity")}
                name="quantity"
                error={e.quantity}
                hint={t(needsMove ? "writeDown.limitUnreserved" : "writeDown.limitOnHand", { value: formatQuantity(limit(line.row), locale) })}
              >
                <DecimalInput value={line.quantity ?? ""} parse={{ maxDecimals: 3 }} onValueChange={(quantity) => patch(key, { quantity })} data-testid="write-down-quantity" />
              </Field>
              {needsMove ? (
                <Field label={t("writeDown.moveTo")} name="move" error={e.move} hint={t("writeDown.moveHint")}>
                  <Select
                    value={line.moveToId}
                    disabled={!canTransfer}
                    onChange={(event) => patch(key, { moveToId: event.target.value })}
                    data-testid="write-down-move-to"
                  >
                    <option value="">{quarantine.length ? t("pickLocation") : t("writeDown.noQuarantine")}</option>
                    {quarantine.map((info) => (
                      <option key={info.id} value={info.id}>
                        {locationLabel(info)}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>
          </Card>
        );
      })}

      <Card className="grid gap-4 md:grid-cols-3">
        <Field label={t("columns.reason")} name="reason">
          <Textarea value={reason} maxLength={450} onChange={(event) => setReason(event.target.value)} data-testid="write-down-reason" />
        </Field>
        <Field label={t("columns.documentDate")} name="document_date">
          <Input type="date" value={date} max={storeDay()} onChange={(event) => setDate(event.target.value)} data-testid="write-down-date" />
        </Field>
        <Field label={t("backdateReason")} name="backdate_reason" hint={t("backdateHint")}>
          <Input value={backdateReason} onChange={(event) => setBackdateReason(event.target.value)} />
        </Field>
      </Card>
      {formError ? <Alert data-testid="write-down-form-error">{formError}</Alert> : null}
      <div className="flex justify-end">
        <Button type="submit" data-testid="write-down-review">
          {t("review")}
        </Button>
      </div>
    </form>
  );
}
