"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { Alert, Badge, Button, Card, Input } from "@/components/ui";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { usePosting } from "@/components/finance/use-posting";
import { InventoryPostingStatus } from "@/components/inventory/inventory-posting-status";
import { browserApi, unwrap } from "@/lib/api/client";
import { errorKind, type ErrorKind } from "@/lib/api/errors";
import { storeDay } from "@/lib/finance/dates";
import { entryHref } from "@/lib/finance/links";
import { newOperationId } from "@/lib/finance/operations";
import {
  carryCounts,
  countDifference,
  countScope,
  documentHref,
  formatQuantity,
  isStaleCount,
  lineKey,
  locationLabel,
  lotHref,
  reservationShortfall,
  shortId,
  stockHref,
  summarizeCount,
  toMilli,
  type Count,
  type LocationInfo,
} from "@/lib/inventory";

export interface ScopeRow {
  sku: string;
  lotNumber: string | null;
  reserved: number;
  quantity: number;
  expiry: string | null;
}

interface Carry {
  from: string;
  lines: Array<{ key: string; system: number; counted: string }>;
}

const CARRY_PREFIX = "shubayr.count-carry.";

function readCarry(id: string): Carry | null {
  try {
    const raw = window.sessionStorage.getItem(CARRY_PREFIX + id);
    if (!raw) return null;
    window.sessionStorage.removeItem(CARRY_PREFIX + id);
    return JSON.parse(raw) as Carry;
  } catch {
    return null;
  }
}

function writeCarry(id: string, carry: Carry) {
  try {
    window.sessionStorage.setItem(CARRY_PREFIX + id, JSON.stringify(carry));
  } catch {
    // Without storage the fresh snapshot simply starts from its own quantities.
  }
}

/** Reservations a line's count releases, kept from the moment of approval. */
type Released = Record<string, number>;

export function CountView({
  count,
  rows,
  locations,
  canApprove,
  canRecount,
  canViewLedger,
}: {
  count: Count;
  rows: Record<string, ScopeRow>;
  locations: Record<string, LocationInfo>;
  canApprove: boolean;
  canRecount: boolean;
  canViewLedger: boolean;
}) {
  const t = useTranslations("inventory");
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const posting = usePosting<Count>();
  const qty = (value: number | string | null | undefined) => formatQuantity(value, locale);
  const [counted, setCounted] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(count.lines.map((line) => [lineKey(line), String(line.counted_quantity)])),
  );
  const [reverify, setReverify] = useState<Record<string, boolean>>({});
  const [carriedFrom, setCarriedFrom] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [date, setDate] = useState(storeDay());
  const [backdateReason, setBackdateReason] = useState("");
  const [review, setReview] = useState<{ operationId: string; released: Released } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [recount, setRecount] = useState<{ pending: boolean; error: ErrorKind | null }>({ pending: false, error: null });

  // A re-snapshot of a stale count brings what was counted with it (once).
  useEffect(() => {
    if (count.status !== "draft") return;
    const carry = readCarry(count.id);
    if (!carry) return;
    const carried = carryCounts(carry.lines, count.lines);
    /* eslint-disable react-hooks/set-state-in-effect -- adopting session data after mount, once */
    setCounted(Object.fromEntries([...carried].map(([key, value]) => [key, value.counted])));
    setReverify(Object.fromEntries([...carried].map(([key, value]) => [key, value.reverify])));
    setCarriedFrom(carry.from);
    setGeneration((value) => value + 1);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [count]);

  const approved = posting.state.phase === "posted" ? posting.state.document : count.status === "approved" ? count : null;
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";
  const stale = posting.state.phase === "error" && isStaleCount(posting.state.error);

  const states = count.lines.map((line) => ({
    batchId: line.batch_id,
    locationId: line.location_id,
    system: line.system_quantity,
    counted: counted[lineKey(line)] ?? null,
  }));
  const summary = summarizeCount(states);
  const releases: Released = {};
  for (const line of count.lines) {
    const key = lineKey(line);
    const shortfall = reservationShortfall(counted[key] ?? null, rows[key]?.reserved ?? 0);
    if (shortfall > 0) releases[key] = shortfall;
  }

  function toReview() {
    if (summary.missing > 0) {
      setFormError(t("count.missing", { count: summary.missing }));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > storeDay()) {
      setFormError(t("errors.future"));
      return;
    }
    setFormError(null);
    posting.reset();
    setReview({ operationId: newOperationId(), released: releases });
  }

  async function confirm() {
    if (!review) return;
    await posting.post(review.operationId, () =>
      unwrap(
        browserApi.POST("/admin/inventory/counts/{id}/approve", {
          params: { path: { id: count.id } },
          body: {
            operation_id: review.operationId,
            document_date: date,
            ...(backdateReason.trim() ? { backdate_reason: backdateReason.trim() } : {}),
            lines: count.lines.map((line) => ({
              batch_id: line.batch_id,
              location_id: line.location_id,
              counted_quantity: counted[lineKey(line)]!,
            })),
          },
        }),
      ),
    );
  }

  /** Stale: snapshot the same scope again and carry the counts across. */
  async function reverifyScope() {
    setRecount({ pending: true, error: null });
    try {
      const fresh = await unwrap(browserApi.POST("/admin/inventory/counts", { body: countScope(count) }));
      writeCarry(fresh.id, {
        from: count.document_number,
        lines: count.lines.map((line) => ({ key: lineKey(line), system: line.system_quantity, counted: counted[lineKey(line)] ?? String(line.system_quantity) })),
      });
      router.push(documentHref("count", fresh.id));
    } catch (cause) {
      setRecount({ pending: false, error: errorKind(cause) });
    }
  }

  const scopeLabel = count.location_id
    ? t("count.scopeLocation", { location: locationLabel(locations[count.location_id], shortId(count.location_id)) })
    : count.warehouse_id
      ? t("count.scopeWarehouse", { warehouse: Object.values(locations).find((info) => info.warehouseId === count.warehouse_id)?.warehouseCode ?? shortId(count.warehouse_id) })
      : t("count.scopeSku", { sku: Object.values(rows)[0]?.sku ?? shortId(count.variant_id) });

  const header = (
    <Card>
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-text-muted">{t("columns.status")}</dt>
          <dd>
            <Badge tone={approved ? "success" : "warning"} data-testid="count-status">
              {t(`documentStatus.${approved ? "approved" : "draft"}`)}
            </Badge>
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">{t("count.scope")}</dt>
          <dd dir="auto" data-testid="count-scope">{scopeLabel}</dd>
        </div>
        <div>
          <dt className="text-text-muted">{t("columns.snapshot")}</dt>
          <dd>{format.dateTime(new Date(count.snapshot_at), { dateStyle: "medium", timeStyle: "medium", numberingSystem: "latn" })}</dd>
        </div>
        <div>
          <dt className="text-text-muted">{t("columns.reason")}</dt>
          <dd>{count.reason}</dd>
        </div>
      </dl>
    </Card>
  );

  if (approved) {
    const released = review?.released ?? {};
    const journal = approved.journal_entry;
    return (
      <div className="flex flex-col gap-6" data-testid="count-approved">
        {header}
        {posting.state.phase === "posted" ? (
          <InventoryPostingStatus state={posting.state} type="count" onRetry={() => undefined} onCheck={() => undefined} />
        ) : null}
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm" data-testid="count-lines">
            <thead className="text-text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">{t("columns.sku")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("columns.lot")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("columns.location")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.system")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.counted")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.difference")}</th>
              </tr>
            </thead>
            <tbody>
              {approved.lines.map((line) => (
                <tr key={line.id} className="border-t border-border" data-testid="count-line">
                  <td className="px-3 py-2 font-semibold" dir="ltr">{rows[lineKey(line)]?.sku ?? shortId(line.variant_id)}</td>
                  <td className="px-3 py-2" dir="ltr">
                    <Link href={lotHref(line.batch_id)} className="text-primary-dark hover:underline">
                      {rows[lineKey(line)]?.lotNumber ?? shortId(line.batch_id)}
                    </Link>
                  </td>
                  <td className="px-3 py-2" dir="ltr">{locationLabel(locations[line.location_id], shortId(line.location_id))}</td>
                  <td className="px-3 py-2 text-end" dir="ltr">{qty(line.system_quantity)}</td>
                  <td className="px-3 py-2 text-end" dir="ltr">{qty(line.counted_quantity)}</td>
                  <td className="px-3 py-2 text-end font-semibold" dir="ltr" data-testid="count-difference">
                    <Difference value={line.difference} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="text-sm">
          {journal ? (
            <p>
              {t("count.posted")}{" "}
              {canViewLedger ? (
                <Link href={entryHref(journal.id)} className="font-semibold text-primary-dark underline" dir="ltr" data-testid="count-entry">
                  {journal.document_number}
                </Link>
              ) : (
                <span dir="ltr">{journal.document_number}</span>
              )}
            </p>
          ) : (
            <p data-testid="count-no-entry">{t("count.noDifferences")}</p>
          )}
        </Card>
        {Object.keys(released).length ? <ReleasedPanel released={released} rows={rows} locations={locations} /> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="count-draft">
      {header}
      {carriedFrom ? (
        <Alert tone="info" data-testid="count-carried">
          {t("count.carried", { from: carriedFrom, count: Object.values(reverify).filter(Boolean).length })}
        </Alert>
      ) : null}
      <Card className="overflow-x-auto">
        {count.lines.length === 0 ? (
          <p className="text-sm text-text-muted">{t("count.emptyScope")}</p>
        ) : (
          <table className="w-full min-w-[48rem] text-sm" data-testid="count-lines">
            <thead className="text-text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">{t("columns.sku")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("columns.lot")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("columns.location")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.system")}</th>
                <th className="w-36 px-3 py-2 text-start font-semibold">{t("columns.counted")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.difference")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.reserved")}</th>
              </tr>
            </thead>
            <tbody>
              {count.lines.map((line) => {
                const key = lineKey(line);
                const value = counted[key] ?? null;
                const row = rows[key];
                return (
                  <tr key={line.id} className="border-t border-border align-top" data-testid="count-line" data-sku={row?.sku ?? ""} data-lot={row?.lotNumber ?? ""}>
                    <td className="px-3 py-2 font-semibold" dir="ltr">
                      <Link href={stockHref({ variant_id: line.variant_id })} className="hover:underline">
                        {row?.sku ?? shortId(line.variant_id)}
                      </Link>
                    </td>
                    <td className="px-3 py-2" dir="ltr">
                      <Link href={lotHref(line.batch_id)} className="text-primary-dark hover:underline">
                        {row ? (row.lotNumber ?? t("noLotNumber")) : shortId(line.batch_id)}
                      </Link>
                    </td>
                    <td className="px-3 py-2" dir="ltr">{locationLabel(locations[line.location_id], shortId(line.location_id))}</td>
                    <td className="px-3 py-2 text-end" dir="ltr" data-testid="count-system">{qty(line.system_quantity)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <DecimalInput
                          key={`${key}:${generation}`}
                          value={value ?? ""}
                          parse={{ required: true, maxDecimals: 3 }}
                          className="h-9"
                          aria-label={t("countedFor", { sku: row?.sku ?? "" })}
                          disabled={!canApprove || review !== null}
                          onValueChange={(next) => setCounted((current) => ({ ...current, [key]: next }))}
                          data-testid="count-input"
                        />
                        {reverify[key] ? (
                          <Badge tone="warning" data-testid="count-reverify">
                            {t("count.reverifyLine")}
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-end font-semibold" dir="ltr" data-testid="count-difference">
                      {value === null ? "—" : <Difference value={countDifference(line.system_quantity, value)} />}
                    </td>
                    <td className="px-3 py-2 text-end" dir="ltr">
                      {qty(row?.reserved ?? 0)}
                      {releases[key] ? (
                        <span className="mt-1 block text-xs font-semibold text-warning-dark" data-testid="count-release-warning">
                          {t("count.releases", { quantity: qty(releases[key]) })}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" data-testid="count-summary">
          <div className="rounded-md bg-card p-3">
            <dt className="text-xs text-text-muted">{t("count.shortage")}</dt>
            <dd className="text-lg font-bold text-error-dark" dir="ltr" data-testid="count-shortage">{qty(summary.shortage)}</dd>
          </div>
          <div className="rounded-md bg-card p-3">
            <dt className="text-xs text-text-muted">{t("count.surplus")}</dt>
            <dd className="text-lg font-bold text-success-dark" dir="ltr" data-testid="count-surplus">{qty(summary.surplus)}</dd>
          </div>
          <div className="rounded-md bg-card p-3">
            <dt className="text-xs text-text-muted">{t("count.changedLines")}</dt>
            <dd className="text-lg font-bold" dir="ltr">{summary.changedLines}</dd>
          </div>
          <div className="rounded-md bg-card p-3">
            <dt className="text-xs text-text-muted">{t("count.releasedTotal")}</dt>
            <dd className="text-lg font-bold" dir="ltr">
              {qty(Object.values(releases).reduce((sum, value) => sum + toMilli(value), 0) / 1000)}
            </dd>
          </div>
        </dl>
        {Object.keys(releases).length ? <Alert tone="info">{t("count.releaseExplain")}</Alert> : null}

        {canApprove ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t("columns.documentDate")} name="document_date">
                <Input type="date" value={date} max={storeDay()} disabled={review !== null} onChange={(event) => setDate(event.target.value)} data-testid="count-date" />
              </Field>
              <Field label={t("backdateReason")} name="backdate_reason" hint={t("backdateHint")}>
                <Input value={backdateReason} disabled={review !== null} onChange={(event) => setBackdateReason(event.target.value)} />
              </Field>
            </div>
            {formError ? <Alert data-testid="count-form-error">{formError}</Alert> : null}
            {stale ? (
              <Alert data-testid="count-stale">
                <p className="font-semibold">{t("count.staleTitle")}</p>
                <p className="mt-1">{t("count.staleBody")}</p>
                {canRecount ? (
                  <Button size="sm" className="mt-3" pending={recount.pending} onClick={() => void reverifyScope()} data-testid="count-reverify-button">
                    <RefreshCw className="size-4" aria-hidden />
                    {t("count.reverify")}
                  </Button>
                ) : (
                  <p className="mt-2 text-xs">{t("count.needsCountPermission")}</p>
                )}
                <FormError kind={recount.error} />
              </Alert>
            ) : review ? (
              <InventoryPostingStatus state={posting.state} type="count" onRetry={() => void confirm()} onCheck={() => void posting.check(review.operationId)} />
            ) : null}
            <div className="flex justify-end gap-2">
              {review === null ? (
                <Button onClick={toReview} disabled={count.lines.length === 0} data-testid="count-review">
                  {t("count.reviewApproval")}
                </Button>
              ) : stale ? null : (
                <>
                  <Button variant="ghost" onClick={() => setReview(null)} disabled={busy}>
                    {t("edit")}
                  </Button>
                  <Button
                    onClick={() => void confirm()}
                    pending={busy}
                    disabled={posting.state.phase === "notPosted" || posting.state.phase === "processing"}
                    data-testid="count-approve"
                  >
                    {t("count.approve", { shortage: qty(summary.shortage), surplus: qty(summary.surplus) })}
                  </Button>
                </>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-text-muted">{t("count.needsAdjustPermission")}</p>
        )}
      </Card>
    </div>
  );
}

function Difference({ value }: { value: number }) {
  const locale = useLocale();
  const milli = toMilli(value);
  const text = formatQuantity(Math.abs(value), locale);
  if (milli === 0) return <span className="text-text-muted">0</span>;
  return milli < 0 ? <span className="text-error-dark">−{text}</span> : <span className="text-success-dark">+{text}</span>;
}

/**
 * Counting below what was reserved released those reservations, and the
 * API flagged the orders holding them for inventory attention. Which orders
 * those are is not in the API's answer yet, so this lists what was released
 * where — captured from the reservations shown when the count was approved.
 */
function ReleasedPanel({
  released,
  rows,
  locations,
}: {
  released: Released;
  rows: Record<string, ScopeRow>;
  locations: Record<string, LocationInfo>;
}) {
  const t = useTranslations("inventory");
  const locale = useLocale();
  return (
    <Card className="flex flex-col gap-2" data-testid="count-released">
      <h2 className="font-bold">{t("count.releasedTitle")}</h2>
      <p className="text-sm text-text-muted">{t("count.releasedBody")}</p>
      <ul className="text-sm">
        {Object.entries(released).map(([key, quantity]) => {
          const [, locationId] = key.split(":");
          return (
            <li key={key} dir="ltr">
              {rows[key]?.sku ?? key.slice(0, 8)} · {rows[key]?.lotNumber ?? ""} · {locationLabel(locations[locationId ?? ""])} — {formatQuantity(quantity, locale)}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
