"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, PackageSearch, Undo2 } from "lucide-react";
import { Alert, Badge, Button, Card } from "@/components/ui";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Field } from "@/components/forms/field";
import { useStoreDateTime } from "@/components/orders/use-store-date";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { newOperationId } from "@/lib/finance/operations";
import { formatQuantity, toMilli } from "@/lib/inventory";
import {
  attention,
  canOpenRetrieval,
  canResolveShortage,
  cancellationResolutions,
  formatMoney,
  type AdminOrder,
  type BelowCostBreach,
  type CancellationResolution,
} from "@/lib/orders";

type Done = (order: AdminOrder) => void;
type Refused = (cause: unknown) => Promise<void>;

function itemName(order: AdminOrder, orderItemId: string, locale: string): string {
  const item = (order.items ?? []).find((row) => row.id === orderItemId);
  if (!item) return orderItemId.slice(0, 8);
  return (locale === "ar" ? item.product_name_ar : item.product_name_en) ?? "";
}

/* ---------------------------------------------------------- needs attention */

type ShortageAction =
  | { kind: "reduce"; orderItemId: string; requested: string; allocated: string }
  | { kind: "cancel_line"; orderItemId: string }
  | { kind: "cancel_order" };

/**
 * Preparation found less stock than ordered (API 10.0). The API offers two
 * ways out: propose a smaller quantity, which the CUSTOMER must accept, or
 * cancel the short line (or the whole order). The order can't be marked ready
 * until every short line is resolved.
 */
export function AttentionPanel({
  order,
  permissions,
  onDone,
  onRefused,
}: {
  order: AdminOrder;
  permissions: string[];
  onDone: Done;
  onRefused: Refused;
}) {
  const t = useTranslations("orders.attention");
  const locale = useLocale();
  const { shortLines, proposal } = attention(order);
  const [action, setAction] = useState<ShortageAction | null>(null);
  const [quantity, setQuantity] = useState<string | null>(null);
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const canAct = canResolveShortage(order, permissions);
  if (!order.inventory_attention_required && !proposal) return null;

  async function submit(reason: string) {
    if (!action) return;
    const body =
      action.kind === "reduce"
        ? { action: "reduce" as const, order_item_id: action.orderItemId, new_quantity: Number(quantity), reason, version: order.version! }
        : action.kind === "cancel_line"
          ? { action: "cancel_line" as const, order_item_id: action.orderItemId, reason, version: order.version! }
          : { action: "cancel_order" as const, reason, version: order.version! };
    try {
      onDone(await unwrap(browserApi.POST("/admin/orders/{id}/shortage-resolution", { params: { path: { id: order.id! } }, body })));
    } catch (cause) {
      await onRefused(cause);
    }
  }

  return (
    <Card className="flex flex-col gap-3 border-warning/50 p-5" data-testid="order-attention">
      <h2 className="flex items-center gap-2 font-bold text-warning-dark">
        <AlertTriangle className="size-4" aria-hidden />
        {t("title")}
      </h2>
      <p className="text-sm text-text-muted">{t("body")}</p>
      {shortLines.length ? (
        <table className="w-full text-sm">
          <thead className="text-text-muted">
            <tr>
              <th className="px-2 py-1 text-start font-semibold">{t("columns.item")}</th>
              <th className="px-2 py-1 text-end font-semibold">{t("columns.ordered")}</th>
              <th className="px-2 py-1 text-end font-semibold">{t("columns.allocated")}</th>
              <th className="px-2 py-1 text-end font-semibold">{t("columns.short")}</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {shortLines.map((line) => (
              <tr key={line.orderItemId} className="border-t border-border" data-testid="short-line">
                <td className="px-2 py-2">{itemName(order, line.orderItemId, locale)}</td>
                <td className="px-2 py-2 text-end" dir="ltr">{formatQuantity(line.requested, locale)}</td>
                <td className="px-2 py-2 text-end" dir="ltr" data-testid="short-allocated">{formatQuantity(line.allocated, locale)}</td>
                <td className="px-2 py-2 text-end font-semibold text-error-dark" dir="ltr" data-testid="short-quantity">
                  {formatQuantity(line.short, locale)}
                </td>
                <td className="px-2 py-2">
                  {canAct ? (
                    <div className="flex flex-wrap justify-end gap-1">
                      {toMilli(line.allocated) > 0 ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setQuantity(String(Number(line.allocated)));
                            setQuantityError(null);
                            setAction({ kind: "reduce", orderItemId: line.orderItemId, requested: line.requested, allocated: line.allocated });
                          }}
                          data-testid="short-reduce"
                        >
                          {t("reduce")}
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" onClick={() => setAction({ kind: "cancel_line", orderItemId: line.orderItemId })} data-testid="short-cancel-line">
                        {t("cancelLine")}
                      </Button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {proposal ? (
        <Alert tone={proposal.status === "pending" ? "info" : proposal.status === "accepted" ? "success" : "danger"} data-testid="reduction-proposal" data-status={proposal.status}>
          {t(`proposal.${proposal.status}`, {
            item: itemName(order, proposal.orderItemId, locale),
            from: formatQuantity(proposal.oldQuantity, locale),
            to: formatQuantity(proposal.newQuantity, locale),
          })}
        </Alert>
      ) : null}
      {canAct ? (
        <div>
          <Button variant="danger" size="sm" onClick={() => setAction({ kind: "cancel_order" })} data-testid="short-cancel-order">
            {t("cancelOrder")}
          </Button>
        </div>
      ) : order.inventory_attention_required && !permissions.includes("orders.shortage.resolve") ? (
        <p className="text-xs text-text-muted">{t("needsPermission")}</p>
      ) : null}

      <ConfirmDialog
        open={action !== null}
        title={action ? t(`dialog.${action.kind}`) : ""}
        body={action ? t(`dialog.${action.kind}Body`) : undefined}
        confirmLabel={action ? t(`dialog.${action.kind}Confirm`) : ""}
        tone={action?.kind === "reduce" ? "primary" : "danger"}
        onConfirm={async (reason) => {
          if (action?.kind === "reduce") {
            const value = Number(quantity);
            if (!quantity || !(value > 0) || toMilli(value) >= toMilli(action.requested)) {
              setQuantityError(t("dialog.quantityError", { ordered: formatQuantity(action.requested, locale) }));
              throw new ApiError(422, t("dialog.quantityError", { ordered: formatQuantity(action.requested, locale) }));
            }
          }
          await submit(reason);
        }}
        onClose={() => setAction(null)}
      >
        {action?.kind === "reduce" ? (
          <Field
            label={t("dialog.newQuantity")}
            name="new_quantity"
            error={quantityError}
            hint={t("dialog.newQuantityHint", { allocated: formatQuantity(action.allocated, locale), ordered: formatQuantity(action.requested, locale) })}
          >
            <DecimalInput value={quantity ?? ""} parse={{ maxDecimals: 3 }} onValueChange={(value) => setQuantity(value)} data-testid="reduce-quantity" />
          </Field>
        ) : null}
      </ConfirmDialog>
    </Card>
  );
}

/* ------------------------------------------------- cancellation requests */

/**
 * A customer asked to cancel after the order left "pending". Staff with
 * orders.cancel_request.resolve approve (the order is cancelled; after
 * dispatch a retrieval brings the goods back) or deny it, with a reason.
 */
export function CancellationRequestPanel({
  order,
  permissions,
  onDone,
  onRefused,
}: {
  order: AdminOrder;
  permissions: string[];
  onDone: Done;
  onRefused: Refused;
}) {
  const t = useTranslations("orders.cancellation");
  const dateTime = useStoreDateTime();
  const [decision, setDecision] = useState<CancellationResolution | null>(null);
  const request = order.cancellation_request;
  if (!request) return null;
  const options = cancellationResolutions(order, permissions);
  const afterDispatch = order.status === "dispatched" || order.status === "failed";

  async function resolve(reason: string) {
    try {
      onDone(
        await unwrap(
          browserApi.POST("/admin/orders/{id}/cancellation-request/resolve", {
            params: { path: { id: order.id! } },
            body: { decision: decision === "approve" ? "approved" : "denied", reason, version: order.version! },
          }),
        ),
      );
    } catch (cause) {
      await onRefused(cause);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5" data-testid="cancellation-request" data-status={request.status}>
      <h2 className="flex items-center gap-2 font-bold">
        <Undo2 className="size-4" aria-hidden />
        {t("title")}
        <Badge tone={request.status === "pending" ? "warning" : request.status === "approved" ? "success" : "neutral"}>{t(`status.${request.status}`)}</Badge>
      </h2>
      <dl className="grid gap-1 text-sm">
        <div>
          <dt className="inline text-text-muted">{t("reason")}: </dt>
          <dd className="inline" data-testid="cancellation-reason">{request.reason ?? "—"}</dd>
        </div>
        {request.requested_at ? (
          <div>
            <dt className="inline text-text-muted">{t("requestedAt")}: </dt>
            <dd className="inline">{dateTime(request.requested_at)}</dd>
          </div>
        ) : null}
        {request.resolution_note ? (
          <div>
            <dt className="inline text-text-muted">{t("resolution")}: </dt>
            <dd className="inline" data-testid="cancellation-resolution">{request.resolution_note}</dd>
          </div>
        ) : null}
      </dl>
      {options.length ? (
        <div className="flex flex-wrap gap-2">
          {options.includes("approve") ? (
            <Button variant="danger" onClick={() => setDecision("approve")} data-testid="cancellation-approve">
              {t("approve")}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => setDecision("deny")} data-testid="cancellation-deny">
            {t("deny")}
          </Button>
        </div>
      ) : null}
      {request.status === "pending" && afterDispatch && !options.includes("approve") && options.length ? (
        <p className="text-xs text-text-muted">{t("afterDispatchPermission")}</p>
      ) : null}
      <ConfirmDialog
        open={decision !== null}
        title={decision ? t(`dialog.${decision}`) : ""}
        body={decision === "approve" ? (afterDispatch ? t("dialog.approveAfterDispatch") : t("dialog.approveBody")) : t("dialog.denyBody")}
        confirmLabel={decision ? t(decision) : ""}
        tone={decision === "approve" ? "danger" : "primary"}
        onConfirm={resolve}
        onClose={() => setDecision(null)}
      />
    </Card>
  );
}

/* --------------------------------------------------------------- retrievals */

/**
 * Goods that left with an agent and must come back: a failed delivery
 * brought back for a retry (opened here), or a cancellation approved after
 * dispatch (opened by the API). Each retrieval has its own page, where the
 * goods are received in full or in part.
 */
export function RetrievalsPanel({ order, permissions, onRefused }: { order: AdminOrder; permissions: string[]; onRefused: Refused }) {
  const t = useTranslations("orders.retrievals");
  const tList = useTranslations("retrievals.list");
  const router = useRouter();
  const [opening, setOpening] = useState<{ operationId: string } | null>(null);
  const rows = order.retrievals ?? [];
  const canOpen = canOpenRetrieval(order, permissions);
  if (!rows.length && !canOpen) return null;

  async function open(reason: string) {
    try {
      const created = await unwrap(
        browserApi.POST("/admin/orders/{id}/retrievals", {
          params: { path: { id: order.id! } },
          body: { operation_id: opening!.operationId, outcome: "retry", reason },
        }),
      );
      router.push(`/retrievals/${created.id}`);
    } catch (cause) {
      await onRefused(cause);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5" data-testid="order-retrievals">
      <h2 className="flex items-center gap-2 font-bold">
        <PackageSearch className="size-4" aria-hidden />
        {t("title")}
      </h2>
      {rows.length ? (
        <ul className="flex flex-col gap-1 text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2" data-testid="retrieval-row">
              {permissions.includes("retrieval.view") ? (
                <Link href={`/retrievals/${row.id}`} className="font-semibold text-primary-dark hover:underline" dir="ltr" data-testid="retrieval-link">
                  {row.document_number}
                </Link>
              ) : (
                <span dir="ltr">{row.document_number}</span>
              )}
              <Badge>{t(`outcome.${row.outcome ?? "retry"}`)}</Badge>
              <Badge tone={row.status === "received" || row.status === "closed" ? "success" : "warning"}>{t(`status.${row.status ?? "open"}`)}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-muted">{t("none")}</p>
      )}
      {rows.length && permissions.includes("retrieval.view") ? (
        <Link href={`/retrievals?order_id=${order.id}`} className="text-sm font-semibold text-primary-dark hover:underline" data-testid="order-retrievals-all">
          {tList("viewAllForOrder")}
        </Link>
      ) : null}
      {canOpen ? (
        <div>
          <Button variant="secondary" size="sm" onClick={() => setOpening({ operationId: newOperationId() })} data-testid="retrieval-open">
            {t("open")}
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={opening !== null}
        title={t("dialog.title")}
        body={t("dialog.body")}
        confirmLabel={t("open")}
        tone="primary"
        onConfirm={open}
        onClose={() => setOpening(null)}
      />
    </Card>
  );
}

/* --------------------------------------------------------------- below cost */

/**
 * The API refused to confirm because a line sells below the protected cost
 * threshold. Everyone sees which SKUs and prices; the cost and minimum price
 * only with cost.view (the API omits them otherwise). Someone with
 * sell_below_cost.approve may approve with a reason — but never their own
 * order: separation of duties refuses that, and the panel says so.
 */
export function BelowCostPanel({
  breaches,
  currency,
  canApprove,
  selfRefused,
  onApprove,
  note,
}: {
  breaches: BelowCostBreach[];
  currency: string;
  canApprove: boolean;
  selfRefused: boolean;
  onApprove?: (reason: string) => Promise<void>;
  /** Replaces the "needs an approver" line when approval isn't offered here. */
  note?: string;
}) {
  const t = useTranslations("orders.belowCost");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const showCost = breaches.some((row) => row.cost !== null);
  const money = (value: number | null) => (value === null ? "—" : formatMoney(value, currency, locale));

  return (
    <Card className="flex flex-col gap-3 border-error/40 p-5" data-testid="below-cost">
      <h2 className="flex items-center gap-2 font-bold text-error-dark">
        <AlertTriangle className="size-4" aria-hidden />
        {t("title")}
      </h2>
      <p className="text-sm text-text-muted">{t("body")}</p>
      <table className="w-full text-sm">
        <thead className="text-text-muted">
          <tr>
            <th className="px-2 py-1 text-start font-semibold">{t("columns.sku")}</th>
            <th className="px-2 py-1 text-end font-semibold">{t("columns.price")}</th>
            <th className="px-2 py-1 text-end font-semibold">{t("columns.threshold")}</th>
            {showCost ? (
              <>
                <th className="px-2 py-1 text-end font-semibold" data-testid="below-cost-cost-column">{t("columns.cost")}</th>
                <th className="px-2 py-1 text-end font-semibold">{t("columns.minimum")}</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {breaches.map((row) => (
            <tr key={row.variantId ?? row.sku} className="border-t border-border" data-testid="below-cost-row">
              <td className="px-2 py-2 font-semibold" dir="ltr">{row.sku}</td>
              <td className="px-2 py-2 text-end" dir="ltr">{money(row.price)}</td>
              <td className="px-2 py-2 text-end" dir="ltr">{row.thresholdPercent === null ? "—" : `${row.thresholdPercent}%`}</td>
              {showCost ? (
                <>
                  <td className="px-2 py-2 text-end" dir="ltr">{money(row.cost)}</td>
                  <td className="px-2 py-2 text-end" dir="ltr">{money(row.minimumPrice)}</td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {selfRefused ? (
        <Alert data-testid="below-cost-self-refused">{t("selfRefused")}</Alert>
      ) : null}
      {canApprove && onApprove ? (
        <div>
          <Button variant="danger" onClick={() => setOpen(true)} data-testid="below-cost-approve">
            {t("approve")}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-text-muted" data-testid="below-cost-needs-approval">{note ?? t("needsApproval")}</p>
      )}
      <ConfirmDialog
        open={open}
        title={t("dialog.title")}
        body={t("dialog.body")}
        confirmLabel={t("approve")}
        onConfirm={onApprove ?? (async () => undefined)}
        onClose={() => setOpen(false)}
      />
    </Card>
  );
}

/**
 * Every delivery attempt for the order, oldest first (contract 11.0): who
 * carried it, when, how it ended and why it failed. The history is
 * immutable, so a retry adds a row instead of hiding the earlier failure.
 */
export function DeliveryAttemptsPanel({ order }: { order: AdminOrder }) {
  const t = useTranslations("orders.attempts");
  const dateTime = useStoreDateTime();
  const attempts = [...(order.delivery_attempts ?? [])].sort((a, b) => a.started_at.localeCompare(b.started_at) || a.attempt_number - b.attempt_number);
  if (!attempts.length) return null;
  return (
    <Card className="flex flex-col gap-3 p-5" data-testid="delivery-attempts">
      <h2 className="font-bold">{t("title")}</h2>
      <ol className="flex flex-col gap-2 text-sm">
        {attempts.map((attempt, index) => (
          <li key={attempt.id} className="flex flex-col gap-0.5 rounded-md bg-card p-3" data-testid="delivery-attempt" data-status={attempt.status}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{t("number", { number: index + 1 })}</span>
              <Badge tone={attempt.status === "delivered" ? "success" : attempt.status === "failed" ? "danger" : "info"}>{t(`status.${attempt.status}`)}</Badge>
            </div>
            <span className="text-text-muted" data-testid="delivery-attempt-party">
              {t("party", { name: attempt.party?.name || t("unnamedParty") })}
            </span>
            <span className="text-xs text-text-muted">
              {t("started", { at: dateTime(attempt.started_at) })}
              {attempt.completed_at ? ` · ${t("ended", { at: dateTime(attempt.completed_at) })}` : ""}
            </span>
            {attempt.reason ? (
              <span className="text-text" data-testid="delivery-attempt-reason">
                {t("reason", { reason: attempt.reason })}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
