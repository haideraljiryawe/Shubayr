"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, ClipboardList, History, MapPin, Truck, User } from "lucide-react";
import { Alert, Badge, Button, Card } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { FormError } from "@/components/forms/form-error";
import { PartyPicker } from "@/components/orders/party-picker";
import { AttentionPanel, BelowCostPanel, CancellationRequestPanel, DeliveryAttemptsPanel, RetrievalsPanel } from "@/components/orders/lifecycle-panels";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { useStoreDateTime } from "@/components/orders/use-store-date";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError, errorKind, type ErrorKind } from "@/lib/api/errors";
import {
  DELIVERY_MOVES,
  REASON_ACTIONS,
  STATUS_MOVES,
  availableActions,
  belowCostBreaches,
  hasPickList,
  isSelfApprovalRefused,
  needsAttentionRefusal,
  staleState,
  type BelowCostBreach,
  canAssignAgent,
  dispatchBlocker,
  formatMoney,
  type AdminOrder,
  type OrderAction,
  type OrderStatus,
} from "@/lib/orders";

type Notice =
  | { kind: "conflict"; status: OrderStatus | null }
  | { kind: "attention" }
  | { kind: "forbidden" };

/**
 * The order-management page.
 *
 * Buttons come from `availableActions` (permission AND state). The API still
 * decides: a 409 means the order moved on since this page was rendered —
 * someone else acted, or the customer cancelled — so the page re-reads it,
 * says what it is now, and refreshes to offer what is possible now. A 403
 * means a permission was revoked meanwhile, handled the same way.
 */
export function OrderDetailView({
  order: initial,
  permissions,
  currency,
}: {
  order: AdminOrder;
  permissions: string[];
  currency: string;
}) {
  const t = useTranslations("orders");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const dateTime = useStoreDateTime();

  // The last answer this page received, shown until the next server render
  // (router.refresh) brings a new `initial`, which then wins. Not a remount:
  // the conflict or permission notice must survive that refresh.
  const [override, setOverride] = useState<{
    from: AdminOrder;
    value: AdminOrder;
  } | null>(null);
  const order =
    override && override.from === initial ? override.value : initial;
  const setOrder = (value: AdminOrder) => setOverride({ from: initial, value });
  // Contract 7.0: the order names its own currency; the store's is only the
  // fallback for an older API.
  const money = (amount: number | undefined) =>
    formatMoney(amount, order.currency ?? currency, locale);
  const [pending, setPending] = useState<OrderAction | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [partyId, setPartyId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<ErrorKind | null>(null);
  /** Confirmation refused below cost (API 10.0), until approved or left. */
  const [belowCost, setBelowCost] = useState<BelowCostBreach[] | null>(null);
  const [selfRefused, setSelfRefused] = useState(false);

  const id = order.id!;
  const actions = availableActions(order, permissions);
  const blocker = dispatchBlocker(order);
  const assignable = canAssignAgent(order, permissions);

  /** Sort a refusal: stale state or lost permission refresh; anything else throws. */
  async function handleRefusal(cause: unknown): Promise<void> {
    if (needsAttentionRefusal(cause)) {
      setNotice({ kind: "attention" });
      router.refresh();
      return;
    }
    if (cause instanceof ApiError && cause.status === 409) {
      // STALE_ORDER_STATE names where the order is now; the page re-reads it
      // either way, so every button matches the new state.
      const stale = staleState(cause);
      const fresh = await unwrap(
        browserApi.GET("/admin/orders/{id}", { params: { path: { id } } }),
      ).catch(() => null);
      if (fresh) setOrder(fresh);
      setNotice({ kind: "conflict", status: fresh?.status ?? stale?.status ?? null });
      router.refresh();
      return;
    }
    if (cause instanceof ApiError && cause.status === 403) {
      setNotice({ kind: "forbidden" });
      router.refresh();
      return;
    }
    throw cause;
  }

  async function perform(action: OrderAction, reason: string) {
    setNotice(null);
    try {
      // Reject and cancel are different routes and different statuses: a
      // store's refusal of a pending order is never recorded as a cancel.
      const next = action === "reject"
        ? await unwrap(
            browserApi.POST("/admin/orders/{id}/reject", {
              params: { path: { id } },
              body: { reason, version: order.version! },
            }),
          )
        : action === "cancel"
        ? await unwrap(
            browserApi.POST("/admin/orders/{id}/cancel", {
              params: { path: { id } },
              body: { reason, version: order.version! },
            }),
          )
        : action in DELIVERY_MOVES
        ? await moveDelivery(action as keyof typeof DELIVERY_MOVES, reason)
        : await unwrap(
            browserApi.PATCH("/admin/orders/{id}/status", {
              params: { path: { id } },
              body: {
                status: STATUS_MOVES[action as keyof typeof STATUS_MOVES],
                version: order.version!,
              },
            }),
          );
      setOrder(next);
      setBelowCost(null);
      toast(t("done"));
      router.refresh();
    } catch (cause) {
      const breaches = belowCostBreaches(cause);
      if (action === "accept" && breaches) {
        setSelfRefused(false);
        setBelowCost(breaches);
        return;
      }
      await handleRefusal(cause);
    }
  }

  /**
   * Approve a below-cost confirmation (sell_below_cost.approve). The order's
   * originator is its customer; separation of duties refuses an approver who
   * is that same person.
   */
  async function approveBelowCost(reason: string) {
    try {
      const next = await unwrap(
        browserApi.PATCH("/admin/orders/{id}/status", {
          params: { path: { id } },
          body: {
            status: "confirmed",
            version: order.version!,
            below_cost_override_reason: reason,
          },
        }),
      );
      setOrder(next);
      setBelowCost(null);
      setSelfRefused(false);
      toast(t("done"));
      router.refresh();
    } catch (cause) {
      if (isSelfApprovalRefused(cause)) {
        setSelfRefused(true);
        return;
      }
      setBelowCost(null);
      await handleRefusal(cause);
    }
  }

  const onPanelDone = (next: AdminOrder) => {
    setNotice(null);
    setOrder(next);
    toast(t("done"));
    router.refresh();
  };

  /**
   * Deliver, fail (with a reason) or retry through the staff delivery route
   * (API 10.0). It answers the delivery, so the order is read again.
   */
  async function moveDelivery(action: keyof typeof DELIVERY_MOVES, reason: string): Promise<AdminOrder> {
    const deliveryId = order.delivery?.id;
    if (!deliveryId) throw new ApiError(409, "Order has no current delivery");
    await unwrap(
      browserApi.PATCH("/admin/deliveries/{id}/status", {
        params: { path: { id: deliveryId } },
        body: {
          status: DELIVERY_MOVES[action],
          order_version: order.version!,
          ...(action === "fail" ? { reason } : {}),
        },
      }),
    );
    return unwrap(browserApi.GET("/admin/orders/{id}", { params: { path: { id } } }));
  }

  async function assign() {
    if (!partyId || !order.delivery?.id) return;
    setAssigning(true);
    setAssignError(null);
    setNotice(null);
    try {
      await unwrap(
        browserApi.PATCH("/deliveries/{id}/assign", {
          params: { path: { id: order.delivery.id } },
          // An internal agent or an external driver (contract 11.2).
          body: { party_id: partyId },
        }),
      );
      const fresh = await unwrap(
        browserApi.GET("/admin/orders/{id}", { params: { path: { id } } }),
      );
      setOrder(fresh);
      setPartyId("");
      toast(t("assign.done"));
      router.refresh();
    } catch (cause) {
      try {
        await handleRefusal(cause);
      } catch (other) {
        setAssignError(errorKind(other));
      }
    } finally {
      setAssigning(false);
    }
  }

  const address = order.shipping_snapshot;
  const events = [...(order.status_events ?? [])].sort((a, b) =>
    (a.at ?? "").localeCompare(b.at ?? ""),
  );
  // Who carries it: a party (11.2), or the agent an older API names.
  const carrier = order.delivery?.party ?? order.delivery?.agent ?? null;

  return (
    <div className="flex flex-col gap-5" data-testid="order-detail" data-status={order.status}>
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-dark"
      >
        <ArrowRight className="size-4 ltr:-scale-x-100" aria-hidden />
        {t("back")}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold" dir="ltr" data-testid="order-number">
            {order.order_number}
          </h1>
          <span className="text-sm text-text-muted">{dateTime(order.placed_at)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {order.late_for_acceptance && order.status === "pending" ? (
            <Badge tone="danger" data-testid="order-late">{t("badges.late")}</Badge>
          ) : null}
          {order.inventory_attention_required ? (
            <Badge tone="warning" data-testid="order-needs-attention">{t("badges.attention")}</Badge>
          ) : null}
          {order.cancellation_request?.status === "pending" ? (
            <Badge tone="warning" data-testid="order-cancel-requested">{t("badges.cancelRequested")}</Badge>
          ) : null}
          <OrderStatusBadge status={order.status} />
        </div>
      </div>
      {order.late_for_acceptance && order.status === "pending" && order.acceptance_deadline ? (
        <Alert data-testid="order-late-alert">{t("lateAlert", { deadline: dateTime(order.acceptance_deadline) })}</Alert>
      ) : null}

      {notice?.kind === "conflict" ? (
        <Alert tone="info" data-testid="order-conflict">
          {notice.status
            ? t("conflict", { status: t(`status.${notice.status}`) })
            : t("conflictGeneric")}
        </Alert>
      ) : null}
      {notice?.kind === "forbidden" ? (
        <Alert data-testid="order-forbidden">{t("forbidden")}</Alert>
      ) : null}
      {notice?.kind === "attention" ? (
        <Alert data-testid="order-attention-refused">{t("attentionRefused")}</Alert>
      ) : null}
      {belowCost ? (
        <BelowCostPanel
          breaches={belowCost}
          currency={order.currency ?? currency}
          canApprove={permissions.includes("sell_below_cost.approve")}
          selfRefused={selfRefused}
          onApprove={approveBelowCost}
        />
      ) : null}
      <AttentionPanel order={order} permissions={permissions} onDone={onPanelDone} onRefused={handleRefusal} />
      <CancellationRequestPanel order={order} permissions={permissions} onDone={onPanelDone} onRefused={handleRefusal} />

      <Card className="flex flex-col gap-3 p-5" data-testid="order-actions">
        <h2 className="font-bold">{t("detail.actions")}</h2>
        {actions.length === 0 ? (
          <p className="text-sm text-text-muted" data-testid="order-no-actions">
            {t("detail.noActions")}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((action) => {
              const blocked = action === "dispatch" && blocker !== null;
              return (
                <Button
                  key={action}
                  variant={REASON_ACTIONS.has(action) ? "danger" : action === "retry" ? "secondary" : "primary"}
                  disabled={blocked}
                  onClick={() => setPending(action)}
                  data-testid={`order-action-${action}`}
                >
                  {t(`action.${action}`)}
                </Button>
              );
            })}
          </div>
        )}
        {hasPickList(order, permissions) ? (
          <Link href={`/orders/${id}/pick-list`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-dark hover:underline" data-testid="order-pick-list">
            <ClipboardList className="size-4" aria-hidden />
            {t("pickList.open")}
          </Link>
        ) : null}
        {order.delivery?.status === "failed" && order.delivery.failure_reason ? (
          <p className="text-sm" data-testid="delivery-failure">
            {t("deliveryFailed", { reason: order.delivery.failure_reason, count: order.delivery.retry_count ?? 0 })}
          </p>
        ) : null}
        {actions.includes("dispatch") && blocker ? (
          <p className="text-sm text-text-muted" data-testid="order-dispatch-blocked">
            {t(`dispatchBlocked.${blocker}`)}
          </p>
        ) : null}
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card className="overflow-x-auto p-5">
            <h2 className="mb-3 font-bold">{t("detail.items")}</h2>
            <table className="w-full text-sm">
              <thead className="text-text-muted">
                <tr>
                  <th className="py-1 text-start font-semibold">{t("detail.items")}</th>
                  <th className="py-1 text-center font-semibold">{t("detail.quantity")}</th>
                  <th className="py-1 text-end font-semibold">{t("detail.unitPrice")}</th>
                  <th className="py-1 text-end font-semibold">{t("detail.lineTotal")}</th>
                </tr>
              </thead>
              <tbody>
                {(order.items ?? []).map((item) => (
                  <tr key={item.id} className="border-t border-border" data-testid="order-item">
                    <td className="py-2">
                      {locale === "ar" ? item.product_name_ar : item.product_name_en}
                    </td>
                    <td className="py-2 text-center">{item.quantity}</td>
                    <td className="py-2 text-end">{money(item.unit_price)}</td>
                    <td className="py-2 text-end">{money(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-4 flex flex-col gap-1 border-t border-border pt-3 text-sm">
              <SummaryRow label={t("detail.subtotal")} value={money(order.subtotal)} />
              <SummaryRow label={t("detail.deliveryFee")} value={money(order.delivery_fee)} />
              {order.discount ? (
                <SummaryRow label={t("detail.discount")} value={`-${money(order.discount)}`} />
              ) : null}
              <div className="flex justify-between font-bold">
                <dt>{t("detail.total")}</dt>
                <dd data-testid="order-total">{money(order.total)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm">
              {t("detail.payment")}: {t("detail.cod")}
              {(order.payments ?? []).map((payment) => (
                <Badge key={payment.id} className="ms-2">
                  {payment.status}
                </Badge>
              ))}
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-bold">
              <History className="size-4" aria-hidden />
              {t("detail.timeline")}
            </h2>
            {events.length === 0 ? (
              <p className="text-sm text-text-muted">{t("detail.noTimeline")}</p>
            ) : (
              <ol className="flex flex-col gap-3" data-testid="order-timeline">
                {events.map((event, index) => (
                  <li
                    key={`${event.at}-${index}`}
                    className="flex flex-col gap-0.5 border-s-2 border-primary/40 ps-3"
                    data-testid="timeline-event"
                    data-status={event.status}
                  >
                    <span className="font-semibold">
                      {event.status ? t(`status.${event.status}`) : ""}
                    </span>
                    <span className="text-xs text-text-muted">{dateTime(event.at)}</span>
                    {event.note ? <span className="text-sm">{event.note}</span> : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <DeliveryAttemptsPanel order={order} />
          <RetrievalsPanel order={order} permissions={permissions} onRefused={handleRefusal} />

          <Card className="flex flex-col gap-1 p-5">
            <h2 className="mb-2 flex items-center gap-2 font-bold">
              <User className="size-4" aria-hidden />
              {t("detail.customer")}
            </h2>
            <span>{order.customer?.name || t("noName")}</span>
            <span className="text-sm text-text-muted" dir="ltr">
              {order.customer?.phone}
            </span>
          </Card>

          <Card className="flex flex-col gap-1 p-5">
            <h2 className="mb-2 flex items-center gap-2 font-bold">
              <MapPin className="size-4" aria-hidden />
              {t("detail.address")}
            </h2>
            {address?.address_label ? (
              <span className="font-semibold">{address.address_label}</span>
            ) : null}
            <span className="text-sm">
              {[address?.city, address?.area, address?.street, address?.details]
                .filter(Boolean)
                .join("، ")}
            </span>
            <span className="text-sm text-text-muted" dir="ltr">
              {address?.contact_phone}
            </span>
          </Card>

          <Card className="flex flex-col gap-3 p-5" data-testid="order-delivery">
            <h2 className="flex items-center gap-2 font-bold">
              <Truck className="size-4" aria-hidden />
              {t("detail.delivery")}
            </h2>
            {order.delivery ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {order.delivery.status ? (
                    <Badge tone="info" data-testid="delivery-status" data-status={order.delivery.status}>
                      {t(`deliveryStatus.${order.delivery.status}`)}
                    </Badge>
                  ) : null}
                  <span data-testid="delivery-agent" data-kind={order.delivery.party?.kind ?? undefined}>
                    {carrier ? carrier.name || carrier.phone : t("noAgent")}
                  </span>
                </div>
                {assignable ? (
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void assign();
                    }}
                  >
                    <span className="text-sm font-semibold">
                      {carrier ? t("assign.reassign") : t("assign.title")}
                    </span>
                    <PartyPicker value={partyId} onChange={(picked) => setPartyId(picked?.id ?? "")} />
                    <FormError kind={assignError} />
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={!partyId}
                      pending={assigning}
                      data-testid="assign-submit"
                    >
                      {t("assign.submit")}
                    </Button>
                  </form>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-text-muted">{t("detail.noDelivery")}</p>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={pending ? t(`confirm.${pending}`) : ""}
        body={
          pending === "cancel"
            ? t("confirm.cancelBody")
            : pending === "reject"
              ? t("confirm.rejectBody")
              : pending === "fail"
                ? t("confirm.failBody")
                : undefined
        }
        confirmLabel={pending ? t(`action.${pending}`) : t("confirm.yes")}
        tone={pending && REASON_ACTIONS.has(pending) ? "danger" : "primary"}
        requireReason={pending !== null && REASON_ACTIONS.has(pending)}
        onConfirm={(reason) => perform(pending!, reason)}
        onClose={() => setPending(null)}
      />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-text-muted">
      <dt>{label}</dt>
      <dd className="text-text">{value}</dd>
    </div>
  );
}
