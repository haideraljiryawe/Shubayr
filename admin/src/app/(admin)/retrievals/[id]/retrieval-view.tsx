"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Badge, Button, Card, Select } from "@/components/ui";
import { DecimalInput } from "@/components/forms/decimal-input";
import { usePosting } from "@/components/finance/use-posting";
import { PurchasingPostingStatus } from "@/components/purchasing/posting-status";
import { useStoreDateTime } from "@/components/orders/use-store-date";
import { browserApi, unwrap } from "@/lib/api/client";
import { entryHref } from "@/lib/finance/links";
import { newOperationId } from "@/lib/finance/operations";
import { formatCost, formatQuantity, fromMilli, locationLabel, toMilli, type LocationInfo } from "@/lib/inventory";
import type { components } from "@/types/api";

type Retrieval = components["schemas"]["Retrieval"];
type Line = components["schemas"]["RetrievalLine"];

function outstanding(line: Line): number {
  return Math.max(0, toMilli(line.expected_quantity) - toMilli(line.received_quantity));
}

export function RetrievalView({
  retrieval,
  locations,
  canReceive,
  canViewLedger,
  canViewCost,
}: {
  retrieval: Retrieval;
  locations: LocationInfo[];
  canReceive: boolean;
  canViewLedger: boolean;
  canViewCost: boolean;
}) {
  const t = useTranslations("retrievals");
  const locale = useLocale();
  const router = useRouter();
  const dateTime = useStoreDateTime();
  const posting = usePosting<{ id: string; document_number: string; journal_entry_id?: string | null }>();
  const lines = retrieval.lines ?? [];
  const open = lines.filter((line) => outstanding(line) > 0);
  const sellable = locations.filter((info) => info.sellable);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [placements, setPlacements] = useState<Record<string, string>>(() =>
    Object.fromEntries(open.map((line) => [line.id!, line.location_id ?? sellable[0]?.id ?? locations[0]?.id ?? ""])),
  );
  const [review, setReview] = useState<{ operationId: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** Bumped to start a fresh receipt: remounts the (uncontrolled) quantity inputs. */
  const [round, setRound] = useState(0);
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";
  const posted = posting.state.phase === "posted";
  const qty = (value: number | string | undefined) => formatQuantity(value, locale);
  const productName = (line: Line) => {
    const item = (line.order_item ?? {}) as { product_name_ar?: string; product_name_en?: string };
    return (locale === "ar" ? item.product_name_ar : item.product_name_en) ?? "";
  };
  const lotNumber = (line: Line) => ((line.batch ?? {}) as { lot_number?: string | null }).lot_number ?? "—";

  const chosen = open
    .map((line) => ({ line, quantity: quantities[line.id!] ?? "" }))
    .filter((row) => row.quantity && toMilli(row.quantity) > 0);

  function toReview() {
    if (chosen.length === 0) return setProblem(t("errors.noLines"));
    for (const row of chosen) {
      if (toMilli(row.quantity) > outstanding(row.line)) return setProblem(t("errors.overOutstanding", { left: qty(fromMilli(outstanding(row.line))) }));
      if (!placements[row.line.id!]) return setProblem(t("errors.location"));
    }
    setProblem(null);
    posting.reset();
    setReview({ operationId: newOperationId() });
  }

  /** After a receipt, start another for what is still outstanding (a new operation). */
  function receiveMore() {
    posting.reset();
    setReview(null);
    setQuantities({});
    setProblem(null);
    setRound((value) => value + 1);
  }

  async function confirm() {
    // Once posted, this review is done: the button is gone, and this guard
    // (with the operation id on the API side) keeps a second post out.
    if (!review || posting.state.phase === "posted") return;
    const state = await posting.post(review.operationId, async () => {
      const received = await unwrap(
        browserApi.POST("/admin/retrievals/{id}/receive", {
          params: { path: { id: retrieval.id! } },
          body: {
            operation_id: review.operationId,
            lines: chosen.map((row) => ({ line_id: row.line.id!, location_id: placements[row.line.id!]!, quantity: row.quantity })),
          },
        }),
      );
      return { id: received.id ?? retrieval.id!, document_number: received.document_number ?? "", journal_entry_id: received.journal_entry_id };
    });
    // Refresh the document (status, received quantities) in place; the view
    // keeps its state, so the confirmation stays on screen.
    if (state?.phase === "posted") router.refresh();
  }

  return (
    <div className="flex flex-col gap-6" data-testid="retrieval-detail" data-status={retrieval.status}>
      <Card>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-text-muted">{t("status")}</dt>
            <dd>
              <Badge tone={retrieval.status === "received" || retrieval.status === "closed" ? "success" : "warning"} data-testid="retrieval-status">
                {t(`statuses.${retrieval.status ?? "open"}`)}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("outcome")}</dt>
            <dd>{t(`outcomes.${retrieval.outcome ?? "retry"}`)}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("opened")}</dt>
            <dd>{retrieval.created_at ? dateTime(retrieval.created_at) : "—"}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("journal")}</dt>
            <dd>
              {retrieval.journal_entry_id ? (
                canViewLedger ? (
                  <Link href={entryHref(retrieval.journal_entry_id)} className="font-semibold text-primary-dark hover:underline">
                    {t("viewEntry")}
                  </Link>
                ) : (
                  t("posted")
                )
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <dt className="text-text-muted">{t("reason")}</dt>
            <dd>{retrieval.reason}</dd>
          </div>
        </dl>
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="mb-1 font-bold">{t("lines")}</h2>
        <p className="mb-3 text-sm text-text-muted">{t("linesBody")}</p>
        <table className="w-full min-w-[44rem] text-sm" data-testid="retrieval-lines">
          <thead className="text-text-muted">
            <tr>
              <th className="px-3 py-2 text-start font-semibold">{t("columns.product")}</th>
              <th className="px-3 py-2 text-start font-semibold">{t("columns.lot")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("columns.expected")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("columns.received")}</th>
              {canViewCost ? <th className="px-3 py-2 text-end font-semibold">{t("columns.unitCost")}</th> : null}
              {canReceive && open.length ? (
                <>
                  <th className="w-36 px-3 py-2 text-start font-semibold">{t("columns.receiveNow")}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t("columns.putBack")}</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const left = outstanding(line);
              return (
                <tr key={line.id} className="border-t border-border" data-testid="retrieval-line">
                  <td className="px-3 py-2">{productName(line)}</td>
                  <td className="px-3 py-2" dir="ltr">{lotNumber(line)}</td>
                  <td className="px-3 py-2 text-end" dir="ltr">{qty(line.expected_quantity)}</td>
                  <td className="px-3 py-2 text-end font-semibold" dir="ltr" data-testid="retrieval-received">{qty(line.received_quantity)}</td>
                  {canViewCost ? <td className="px-3 py-2 text-end" dir="ltr">{formatCost(line.unit_cost_iqd, locale)}</td> : null}
                  {canReceive && open.length ? (
                    left > 0 ? (
                      <>
                        <td className="px-3 py-2">
                          <DecimalInput
                            key={`${line.id}-${round}`}
                            value={quantities[line.id!] ?? ""}
                            parse={{ maxDecimals: 3 }}
                            className="h-9"
                            disabled={review !== null}
                            onValueChange={(_, text) => setQuantities((current) => ({ ...current, [line.id!]: text.trim() }))}
                            data-testid="retrieval-quantity"
                          />
                          <span className="text-xs text-text-muted" dir="ltr">{t("left", { value: qty(fromMilli(left)) })}</span>
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={placements[line.id!] ?? ""}
                            disabled={review !== null}
                            className="h-9"
                            onChange={(event) => setPlacements((current) => ({ ...current, [line.id!]: event.target.value }))}
                            data-testid="retrieval-location"
                          >
                            {locations.map((info) => (
                              <option key={info.id} value={info.id}>
                                {locationLabel(info)}
                              </option>
                            ))}
                          </Select>
                        </td>
                      </>
                    ) : (
                      <td colSpan={2} className="px-3 py-2 text-xs text-text-muted">{t("lineDone")}</td>
                    )
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Shown while lines are open, and kept after a receipt (even the last
          one) so its confirmation stays visible. */}
      {canReceive && (open.length || (review && posted)) ? (
        <Card className="flex flex-col gap-3" data-testid="retrieval-receipt" data-phase={posting.state.phase}>
          {problem ? <Alert data-testid="retrieval-problem">{problem}</Alert> : null}
          {review ? (
            <>
              {posted ? null : <p className="text-sm">{t("reviewBody", { count: chosen.length })}</p>}
              <PurchasingPostingStatus state={posting.state} href={(document) => `/retrievals/${document.id}`} onRetry={() => void confirm()} onCheck={() => void posting.check(review.operationId)} />
              <div className="flex justify-end gap-2">
                {posted ? (
                  open.length ? (
                    <Button variant="secondary" onClick={receiveMore} data-testid="retrieval-receive-more">
                      {t("receiveMore")}
                    </Button>
                  ) : null
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => setReview(null)} disabled={busy}>
                      {t("edit")}
                    </Button>
                    <Button onClick={() => void confirm()} pending={busy} disabled={posting.state.phase === "notPosted" || posting.state.phase === "processing"} data-testid="retrieval-confirm">
                      {t("receive")}
                    </Button>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex justify-end">
              <Button onClick={toReview} data-testid="retrieval-review">
                {t("review")}
              </Button>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
