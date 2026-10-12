"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Alert, Badge, Button, Card, Input, Textarea } from "@/components/ui";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { CollectionFields } from "@/components/orders/collection-fields";
import { usePosting } from "@/components/finance/use-posting";
import { useStoreDateTime } from "@/components/orders/use-store-date";
import { TripRefusal } from "@/components/trips/trip-refusal";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError, errorKind } from "@/lib/api/errors";
import { CollectionOperation, staffDeliveryFields, type CollectionChoice } from "@/lib/collection";
import { exceptionHref } from "@/lib/finance/custody-exceptions";
import { entryHref } from "@/lib/finance/links";
import { fixedText, moneyText, toFixed } from "@/lib/purchasing";
import { blockingOrders, closePreview, orderBlocker, shareTotals, TripEventKey, tripRefusal, type Trip, type TripOrder } from "@/lib/trips";
import type { components } from "@/types/api";

type AdminOrder = components["schemas"]["AdminOrder"];
type Notice = { kind: "added" | "started" | "delivered" | "failed" | "closed"; number?: string };

const STATUS_TONES = { open: "info", in_progress: "warning", closed: "neutral" } as const;

export function TripView({ trip, permissions, today }: { trip: Trip; permissions: string[]; today: string }) {
  const t = useTranslations("trips");
  const locale = useLocale();
  const format = useFormatter();
  const dateTime = useStoreDateTime();
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const can = (key: string) => permissions.includes(key);
  const money = (value: number | bigint) => moneyText(typeof value === "bigint" ? value : toFixed(value), "IQD", 0, locale);
  const day = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium", numberingSystem: "latn", timeZone: "UTC" });
  const settlement = closePreview(trip);

  function done(next: Notice) {
    setNotice(next);
    // The trip, the driver's custody and collections read again.
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6" data-testid="trip-view" data-status={trip.status}>
      {notice ? (
        <Alert tone="success" data-testid="trip-notice" data-kind={notice.kind}>
          {t(`detail.notice.${notice.kind}`, { number: notice.number ?? "" })}
        </Alert>
      ) : null}

      <Card className="grid gap-4 text-sm md:grid-cols-4">
        <Item label={t("detail.status")}>
          <Badge tone={STATUS_TONES[trip.status]} data-testid="trip-status" data-status={trip.status}>
            {t(`statuses.${trip.status}`)}
          </Badge>
        </Item>
        <Item label={t("detail.driver")}>
          <Link href={`/delivery-parties/${trip.driver.id}`} className="font-semibold text-primary-dark hover:underline" data-testid="trip-driver">
            {trip.driver.name}
          </Link>
          <span className="block text-xs text-text-muted" dir="ltr">
            {trip.driver.phone}
            {trip.driver.vehicle_number ? ` · ${trip.driver.vehicle_number}` : ""}
          </span>
        </Item>
        <Item label={t("detail.fare")}>
          <span className="font-bold" dir="ltr" data-testid="trip-fare">
            {money(trip.fare.amount_iqd)}
          </span>
          <span className="block text-xs text-text-muted" data-testid="trip-fare-bearer" data-bearer={trip.fare.bearer}>
            {t(`bearers.${trip.fare.bearer}`)} · {t(`methods.${trip.fare.settlement_method}`)}
            {trip.fare.cash_account ? ` · ${trip.fare.cash_account.name}` : ""}
          </span>
        </Item>
        <Item label={t("detail.documentDate")}>
          {day(trip.document_date)}
          {trip.started_at ? <span className="block text-xs text-text-muted">{t("detail.startedAt", { at: dateTime(trip.started_at) })}</span> : null}
          {trip.closed_at ? <span className="block text-xs text-text-muted">{t("detail.closedAt", { at: dateTime(trip.closed_at) })}</span> : null}
        </Item>
        {trip.fare.failure_cancellation_agreement ? (
          <div className="md:col-span-4">
            <Item label={t("detail.agreement")}>{trip.fare.failure_cancellation_agreement}</Item>
          </div>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3" data-testid="trip-orders">
        <h2 className="text-lg font-bold">{t("detail.orders")}</h2>
        {trip.orders.length === 0 ? (
          <p className="text-sm text-text-muted" data-testid="trip-no-orders">
            {t("detail.noOrders")}
          </p>
        ) : (
          trip.orders.map((order) => <TripOrderRow key={order.id} trip={trip} order={order} permissions={permissions} onDone={done} />)
        )}
      </Card>

      {trip.status === "open" && can("trips.manage") ? <AddOrders trip={trip} onDone={done} /> : null}
      {trip.status === "open" && can("trips.manage") && trip.orders.length ? <StartTrip trip={trip} onDone={done} /> : null}

      <Card className="flex flex-col gap-3" data-testid="trip-settlement">
        <h2 className="text-lg font-bold">{t("detail.settlement")}</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Tile label={t("detail.expected")} value={money(settlement.expected)} testId="trip-expected" />
          <Tile label={t("detail.received")} value={money(settlement.received)} testId="trip-received" />
          <Tile label={t("detail.netted")} value={money(settlement.netted)} testId="trip-netted" />
          <Tile label={t("detail.outstanding")} value={money(settlement.outstanding)} testId="trip-outstanding" />
        </dl>
        {trip.fare.bearer === "customer_direct" ? <p className="text-xs text-text-muted">{t("detail.customerDirectNote")}</p> : null}
        {settlement.outstanding > 0n && can("cash_receipts.receive") && trip.status !== "open" ? (
          <Link
            href={`/finance/cash-receipts/new?party_id=${trip.driver.id}&amount=${fixedText(settlement.outstanding, 0)}`}
            className="self-start font-semibold text-primary-dark hover:underline"
            data-testid="trip-receive-cash"
          >
            {t("detail.receiveCash", { amount: money(settlement.outstanding) })}
          </Link>
        ) : null}
        {trip.status === "closed" ? (
          <p className="text-sm" data-testid="trip-result" data-result={trip.settlement.result}>
            {t(`detail.results.${trip.settlement.result}`)}
          </p>
        ) : null}
        {can("ledger.view") ? (
          <p className="flex flex-wrap gap-3 text-sm">
            {[trip.fare.accrual_journal_entry_id, trip.fare.payment_journal_entry_id, trip.fare.netting_journal_entry_id].flatMap((entry, index) =>
              entry ? [
                <Link key={entry} href={entryHref(entry)} className="text-primary-dark hover:underline">
                  {t(`detail.entries.${index}`)}
                </Link>,
              ] : [],
            )}
          </p>
        ) : null}
      </Card>

      {trip.status === "in_progress" && can("trips.settle") ? <CloseTrip trip={trip} today={today} onDone={done} /> : null}

      {trip.events.length ? (
        <Card className="flex flex-col gap-2 text-sm" data-testid="trip-events">
          <h2 className="font-bold">{t("detail.events")}</h2>
          <ol className="flex flex-col gap-1">
            {trip.events.map((event) => (
              <li key={event.id} data-testid="trip-event" data-type={event.type}>
                <span className="font-semibold">{t(`events.${event.type}`)}</span> · {dateTime(event.event_at)}
                {event.order_id ? <span dir="ltr"> · {trip.orders.find((order) => order.id === event.order_id)?.order_number}</span> : null}
                {event.note ? <span className="text-text-muted"> · {event.note}</span> : null}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-text-muted">{label}</span>
      <span>{children}</span>
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

/**
 * One order on the trip and what can be recorded for it now. Delivered and
 * failed go through the staff delivery route; returned at the door and lost
 * open the custody-exception form for the order; each only with its
 * permission.
 */
function TripOrderRow({ trip, order, permissions, onDone }: { trip: Trip; order: TripOrder; permissions: string[]; onDone: (notice: Notice) => void }) {
  const t = useTranslations("trips");
  const tc = useTranslations("collections");
  const locale = useLocale();
  const [action, setAction] = useState<"deliver" | "fail" | null>(null);
  const can = (key: string) => permissions.includes(key);
  const money = (value: number) => moneyText(toFixed(value), "IQD", 0, locale);
  const out = trip.status === "in_progress" && order.delivery.status === "out_for_delivery";
  const blocker = trip.status === "in_progress" ? orderBlocker(order) : null;

  return (
    <div className="rounded-md border border-border p-3" data-testid="trip-order" data-order={order.order_number} data-blocker={blocker ?? ""}>
      <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <Link href={`/orders/${order.id}`} className="font-semibold text-primary-dark hover:underline" dir="ltr">
            {order.order_number}
          </Link>
          <span className="text-xs text-text-muted">
            {order.destination.city}
            {order.destination.area ? ` · ${order.destination.area}` : ""}
          </span>
          <span className="flex flex-wrap gap-1">
            <Badge tone="info" data-testid="trip-order-delivery" data-status={order.delivery.status}>
              {t(`deliveryStatuses.${order.delivery.status}`)}
            </Badge>
            {order.collection ? (
              <Badge tone={order.collection.status === "confirmed_full" ? "success" : order.collection.status === "confirmed_short" ? "danger" : "warning"} data-testid="trip-order-collection" data-status={order.collection.status}>
                {tc(`status.${order.collection.status}`)}
              </Badge>
            ) : null}
            {blocker ? (
              <Badge tone="warning" data-testid="trip-order-blocker">
                {t(`blockers.${blocker}`)}
              </Badge>
            ) : null}
          </span>
        </div>
        <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
          <dt className="text-text-muted">{t("detail.toCollect")}</dt>
          <dt className="text-text-muted">{t("detail.storeFee")}</dt>
          <dt className="text-text-muted">{t("detail.fareShare")}</dt>
          <dd dir="ltr" className="font-semibold" data-testid="trip-order-due">
            {money(order.amount_to_collect_iqd)}
          </dd>
          <dd dir="ltr">{money(order.store_delivery_fee_iqd)}</dd>
          <dd dir="ltr">{money(order.fare_share_iqd)}</dd>
        </dl>
        {order.collection && order.collection.collected_amount_iqd !== null ? (
          <p className="w-full text-end text-xs">
            <span className="text-text-muted">{t("detail.collected")}: </span>
            <span dir="ltr" className="font-semibold" data-testid="trip-order-collected">
              {money(order.collection.collected_amount_iqd)}
            </span>
          </p>
        ) : null}
      </div>
      {order.exceptions.length ? (
        <p className="mt-2 flex flex-wrap gap-2 text-xs">
          {order.exceptions.map((exception) => (
            <Link key={exception.id} href={exceptionHref(exception.id)} className="text-primary-dark hover:underline" data-testid="trip-order-exception" data-type={exception.type}>
              {exception.document_number} · {t(`exceptionTypes.${exception.type}`)}
            </Link>
          ))}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {out && can("orders.deliver") ? (
          <Button size="sm" variant="secondary" onClick={() => setAction(action === "deliver" ? null : "deliver")} data-testid="trip-order-deliver">
            {t("actions.delivered")}
          </Button>
        ) : null}
        {out && can("orders.fail") ? (
          <Button size="sm" variant="secondary" onClick={() => setAction(action === "fail" ? null : "fail")} data-testid="trip-order-fail">
            {t("actions.failed")}
          </Button>
        ) : null}
        {out && can("orders.deliver") && can("custody_exceptions.return_uncollected") ? (
          <Link href={`/finance/custody-exceptions/new?order_id=${order.id}&type=return_against_uncollected`} className="inline-flex h-8 items-center rounded-md px-2 text-sm font-semibold text-primary-dark hover:bg-card" data-testid="trip-order-return">
            {t("actions.returned")}
          </Link>
        ) : null}
        {trip.status === "in_progress" && ["out_for_delivery", "failed"].includes(order.delivery.status) && can("custody_exceptions.loss") ? (
          <Link href={`/finance/custody-exceptions/new?order_id=${order.id}&type=goods_loss`} className="inline-flex h-8 items-center rounded-md px-2 text-sm font-semibold text-primary-dark hover:bg-card" data-testid="trip-order-lost">
            {t("actions.lost")}
          </Link>
        ) : null}
        {order.delivery.status === "delivered" && order.store_delivery_fee_iqd > 0 && can("custody_exceptions.refund_delivery_fee") ? (
          <Link href={`/finance/custody-exceptions/new?order_id=${order.id}&type=delivery_fee_refund`} className="inline-flex h-8 items-center rounded-md px-2 text-sm font-semibold text-primary-dark hover:bg-card" data-testid="trip-order-refund">
            {t("actions.refund")}
          </Link>
        ) : null}
      </div>
      {action === "deliver" ? <DeliverPanel order={order} onDone={onDone} /> : null}
      {action === "fail" ? <FailPanel order={order} onDone={onDone} /> : null}
    </div>
  );
}

/** Delivered, with the amount collected (pre-filled with what is due) or "not confirmed yet". */
function DeliverPanel({ order, onDone }: { order: TripOrder; onDone: (notice: Notice) => void }) {
  const t = useTranslations("trips");
  const posting = usePosting<unknown>();
  const operation = useRef(new CollectionOperation("trip-delivery"));
  const [choice, setChoice] = useState<CollectionChoice>("confirmed");
  const [amount, setAmount] = useState<string | null>(String(order.amount_to_collect_iqd));
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";

  async function confirm() {
    if (choice === "confirmed" && amount === null) return;
    const fields = staffDeliveryFields(operation.current, choice, amount);
    const settled = await posting.post(fields.operation_id, () =>
      unwrap(
        browserApi.PATCH("/admin/deliveries/{id}/status", {
          params: { path: { id: order.delivery.id } },
          body: { status: "delivered", order_version: order.version, ...fields },
        }),
      ),
    );
    if (settled?.phase === "posted") onDone({ kind: "delivered", number: order.order_number });
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-md bg-card p-3" data-testid="trip-deliver-panel">
      <CollectionFields due={order.amount_to_collect_iqd} currency="IQD" choice={choice} onChoice={setChoice} amount={amount} onAmount={setAmount} allowUnconfirmed />
      {posting.state.phase === "error" ? <FormError kind={errorKind(posting.state.error)} detail={posting.state.error.message} /> : null}
      <div className="flex justify-end">
        <Button pending={busy} onClick={() => void confirm()} data-testid="trip-deliver-confirm">
          {t("actions.confirmDelivered")}
        </Button>
      </div>
    </div>
  );
}

function FailPanel({ order, onDone }: { order: TripOrder; onDone: (notice: Notice) => void }) {
  const t = useTranslations("trips");
  const posting = usePosting<unknown>();
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";

  async function confirm() {
    setAttempted(true);
    if (reason.trim().length < 3) return;
    const settled = await posting.post(`fail-${order.id}-${order.version}`, () =>
      unwrap(
        browserApi.PATCH("/admin/deliveries/{id}/status", {
          params: { path: { id: order.delivery.id } },
          body: { status: "failed", order_version: order.version, reason: reason.trim() },
        }),
      ),
    );
    if (settled?.phase === "posted") onDone({ kind: "failed", number: order.order_number });
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-md bg-card p-3" data-testid="trip-fail-panel">
      <Field label={t("actions.failReason")} name="reason" error={attempted && reason.trim().length < 3 ? t("actions.failReasonRequired") : null}>
        <Textarea value={reason} maxLength={500} rows={2} disabled={busy} onChange={(event) => setReason(event.target.value)} data-testid="trip-fail-reason" />
      </Field>
      {posting.state.phase === "error" ? <FormError kind={errorKind(posting.state.error)} detail={posting.state.error.message} /> : null}
      <div className="flex justify-end">
        <Button variant="danger" pending={busy} onClick={() => void confirm()} data-testid="trip-fail-confirm">
          {t("actions.confirmFailed")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Hand orders over to the driver: orders ready for dispatch, found by
 * number, each with its share of the trip's fare (and, for a customer-paid
 * fare, the customer's acceptance).
 */
function AddOrders({ trip, onDone }: { trip: Trip; onDone: (notice: Notice) => void }) {
  const t = useTranslations("trips");
  const locale = useLocale();
  const posting = usePosting<Trip>();
  const operation = useRef(new TripEventKey());
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminOrder[] | null>(null);
  const [share, setShare] = useState<string>(() => fixedText(shareTotals(trip).left > 0n ? shareTotals(trip).left : 0n, 0));
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const sequence = useRef(0);
  const customerDirect = trip.fare.bearer === "customer_direct";
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";
  const money = (value: number) => moneyText(toFixed(value), "IQD", 0, locale);

  useEffect(() => {
    const ticket = ++sequence.current;
    const timer = setTimeout(() => {
      unwrap(browserApi.GET("/admin/orders", { params: { query: { status: "ready_for_dispatch", per_page: 10, ...(q.trim() ? { q: q.trim().slice(0, 40) } : {}) } } })).then(
        (page) => {
          if (ticket === sequence.current) setRows(page.data.filter((order) => !trip.orders.some((row) => row.id === order.id)));
        },
        () => {
          if (ticket === sequence.current) setRows([]);
        },
      );
    }, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [q, trip.orders]);

  async function add(order: AdminOrder) {
    if (!/^\d+$/.test(share.trim())) return;
    setAdding(order.id!);
    const payload = {
      order_id: order.id!,
      order_version: order.version!,
      fare_share_iqd: share.trim(),
      source: "web_admin",
      ...(customerDirect ? { customer_acceptance_note: note.trim() } : {}),
    };
    const { id, eventAt } = operation.current.take(JSON.stringify(payload));
    const settled = await posting.post(id, () =>
      unwrap(browserApi.POST("/admin/external-driver-trips/{id}/orders", { params: { path: { id: trip.id } }, body: { operation_id: id, ...payload, event_at: eventAt } })),
    );
    setAdding(null);
    if (settled?.phase === "posted") {
      operation.current.reset();
      onDone({ kind: "added", number: order.order_number });
    }
  }

  return (
    <Card className="flex flex-col gap-3" data-testid="trip-add">
      <h2 className="text-lg font-bold">{t("detail.addTitle")}</h2>
      <p className="text-sm text-text-muted">{customerDirect ? t("detail.addBodyCustomer") : t("detail.addBody")}</p>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={t("detail.searchOrder")} name="q">
          <Input value={q} onChange={(event) => setQ(event.target.value)} dir="ltr" data-testid="trip-add-search" />
        </Field>
        <Field label={t("detail.fareShare")} name="fare_share_iqd" hint={t("detail.shareHint", { left: money(Number(shareTotals(trip).left)) })}>
          <DecimalInput value={share} parse={{ maxDecimals: 0 }} onValueChange={(_, text) => setShare(text.trim())} data-testid="trip-add-share" />
        </Field>
        {customerDirect ? (
          <Field label={t("detail.acceptance")} name="customer_acceptance_note" hint={t("detail.acceptanceHint")}>
            <Input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} data-testid="trip-add-note" />
          </Field>
        ) : null}
      </div>
      {posting.state.phase === "error" ? (
        tripRefusal(posting.state.error) ? <TripRefusal error={posting.state.error} /> : <FormError kind={errorKind(posting.state.error)} detail={posting.state.error.message} />
      ) : null}
      {rows === null ? null : rows.length === 0 ? (
        <p className="text-sm text-text-muted" data-testid="trip-add-none">
          {t("detail.noReady")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border text-sm">
          {rows.map((order) => (
            <li key={order.id} className="flex items-center justify-between gap-3 py-2" data-testid="trip-add-row" data-order={order.order_number}>
              <span>
                <span className="font-semibold" dir="ltr">
                  {order.order_number}
                </span>
                <span className="ms-2 text-text-muted" dir="ltr">
                  {money(order.total ?? 0)} · {t("detail.storeFee")}: {money(order.delivery_fee ?? 0)}
                </span>
              </span>
              <Button size="sm" pending={busy && adding === order.id} disabled={busy} onClick={() => void add(order)} data-testid="trip-add-order">
                {t("detail.add")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Start the trip once the orders' fare shares add up to the one fare. */
function StartTrip({ trip, onDone }: { trip: Trip; onDone: (notice: Notice) => void }) {
  const t = useTranslations("trips");
  const locale = useLocale();
  const posting = usePosting<Trip>();
  const operation = useRef(new TripEventKey());
  const totals = shareTotals(trip);
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";
  const money = (value: bigint) => moneyText(value, "IQD", 0, locale);

  async function start() {
    // A new request whenever the orders change (a share fixed after a refusal).
    const { id, eventAt } = operation.current.take(trip.orders.map((order) => `${order.id}:${order.fare_share_iqd}`).join(","));
    const settled = await posting.post(id, () =>
      unwrap(browserApi.POST("/admin/external-driver-trips/{id}/start", { params: { path: { id: trip.id } }, body: { operation_id: id, source: "web_admin", event_at: eventAt } })),
    );
    if (settled?.phase === "posted") onDone({ kind: "started" });
  }

  return (
    <Card className="flex flex-col gap-3" data-testid="trip-start">
      <p className="text-sm" data-testid="trip-shares" data-left={fixedText(totals.left, 0)}>
        {totals.left === 0n ? t("detail.sharesMatch", { fare: money(totals.fare) }) : t("detail.sharesOff", { shares: money(totals.shares), fare: money(totals.fare) })}
      </p>
      {posting.state.phase === "error" ? (
        tripRefusal(posting.state.error) ? <TripRefusal error={posting.state.error} /> : <FormError kind={errorKind(posting.state.error)} detail={posting.state.error.message} />
      ) : null}
      <div className="flex justify-end">
        <Button pending={busy} onClick={() => void start()} data-testid="trip-start-button">
          {t("detail.start")}
        </Button>
      </div>
    </Card>
  );
}

/**
 * Close: the settlement it would record, shown first — cash expected,
 * received, the fare the driver keeps, and the difference left open — and
 * the orders still blocking it, if any. The API refuses the person who
 * created the trip, and any unresolved order; both are said in words.
 */
function CloseTrip({ trip, today, onDone }: { trip: Trip; today: string; onDone: (notice: Notice) => void }) {
  const t = useTranslations("trips");
  const locale = useLocale();
  const posting = usePosting<Trip>();
  const operation = useRef(new TripEventKey());
  const [review, setReview] = useState(false);
  const preview = closePreview(trip);
  const blocking = blockingOrders(trip);
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";
  const money = (value: bigint) => moneyText(value, "IQD", 0, locale);

  async function close() {
    const payload = { document_date: today, source: "web_admin" };
    // A new request whenever an order's state changed since the last try.
    const { id, eventAt } = operation.current.take(JSON.stringify({ payload, orders: trip.orders.map((order) => `${order.id}:${order.version}`) }));
    const settled = await posting.post(id, () =>
      unwrap(browserApi.POST("/admin/external-driver-trips/{id}/close", { params: { path: { id: trip.id } }, body: { operation_id: id, ...payload, event_at: eventAt } })),
    );
    if (settled?.phase === "posted") onDone({ kind: "closed" });
  }

  const error = posting.state.phase === "error" ? posting.state.error : null;
  return (
    <Card className="flex flex-col gap-3" data-testid="trip-close">
      <h2 className="text-lg font-bold">{t("detail.closeTitle")}</h2>
      {blocking.length ? (
        <Alert tone="info" data-testid="trip-close-blocked">
          <p>{t("detail.blockedBody")}</p>
          <ul className="mt-1 list-inside list-disc">
            {blocking.map(({ order, blocker }) => (
              <li key={order.id} data-testid="trip-close-blocker" data-order={order.order_number}>
                <span dir="ltr">{order.order_number}</span> — {t(`blockers.${blocker}`)}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {review ? (
        <div className="flex flex-col gap-3" data-testid="trip-close-review">
          <p className="text-sm" data-testid="trip-close-preview" data-outstanding={fixedText(preview.outstanding, 0)} data-result={preview.result}>
            {preview.outstanding === 0n
              ? t("detail.previewSettled", { expected: money(preview.expected) })
              : preview.outstanding > 0n
                ? t("detail.previewShort", { expected: money(preview.expected), received: money(preview.received), netted: money(preview.netted), difference: money(preview.outstanding) })
                : t("detail.previewOver", { expected: money(preview.expected), received: money(preview.received), difference: money(-preview.outstanding) })}
          </p>
          {preview.nettingTooLarge ? <Alert data-testid="trip-close-netting">{t("refusals.nettingTooLarge")}</Alert> : null}
          {error ? tripRefusal(error) ? <TripRefusal error={error} orders={trip.orders} /> : <FormError kind={errorKind(error)} detail={error instanceof ApiError ? error.message : null} /> : null}
          {posting.state.phase === "posted" ? null : (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => setReview(false)}>
                {t("detail.cancel")}
              </Button>
              <Button pending={busy} onClick={() => void close()} data-testid="trip-close-confirm">
                {t("detail.closeConfirm")}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex justify-end">
          <Button onClick={() => setReview(true)} data-testid="trip-close-button">
            {t("detail.close")}
          </Button>
        </div>
      )}
    </Card>
  );
}
