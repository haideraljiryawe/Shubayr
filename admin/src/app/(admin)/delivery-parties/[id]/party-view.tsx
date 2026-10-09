"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Badge, Card } from "@/components/ui";
import { DateFilter } from "@/components/finance/date-filter";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { useStoreDateTime } from "@/components/orders/use-store-date";
import { DataTable, type Column, type TableState } from "@/components/table/data-table";
import { isIssue, type CashActivity, type HeldOrder, type PartyCustody, type StatementEntry } from "@/lib/delivery-parties";
import { receiptHref } from "@/lib/finance/cash-receipts";
import { tripHref } from "@/lib/trips";
import type { components } from "@/types/api";

type TripStatement = components["schemas"]["ExternalDriverTripStatement"];
import { formatCost, formatQuantity } from "@/lib/inventory";
import { formatMoney } from "@/lib/orders";

export function PartyView({
  custody,
  held,
  statement,
  cashActivity,
  statementState,
  orderFilter,
  canViewCost,
  canRecordException,
  trips,
}: {
  custody: PartyCustody;
  held: HeldOrder[];
  statement: StatementEntry[];
  /** Cash in and out of their custody, on the statement's page and filters (13.2). */
  cashActivity: { total: number; data: CashActivity[] };
  statementState: TableState;
  orderFilter: string | null;
  canViewCost: boolean;
  /** Any custody-exception kind may be recorded (each form checks its own). */
  canRecordException: boolean;
  /** The party's external-driver trips (13.4), newest first. */
  trips: TripStatement[];
}) {
  const t = useTranslations("parties");
  const locale = useLocale();
  const dateTime = useStoreDateTime();
  const qty = (value: number | undefined) => formatQuantity(value, locale);
  const cost = (value: number | undefined) => formatCost(value, locale);
  const days = (value: number | null) => (value === null ? "—" : t("days", { count: value }));
  const { party, goods, cash } = custody;
  // The API leaves cost out without cost.view; the page also hides the
  // columns, so a stale permission never shows an empty cost column.
  const showCost = canViewCost && goods.value_iqd !== undefined;
  const filteredOrder = orderFilter ? statement.find((entry) => entry.order_id === orderFilter)?.order_number : null;

  const columns: Column<StatementEntry>[] = [
    { key: "when", header: t("statement.when"), cell: (entry) => dateTime(entry.occurred_at) },
    {
      key: "event",
      header: t("statement.event"),
      cell: (entry) => (
        <Badge tone={isIssue(entry) ? "info" : "success"} data-testid="statement-event" data-event={entry.event}>
          {t(`events.${entry.event}`)}
        </Badge>
      ),
    },
    {
      key: "order",
      header: t("statement.order"),
      cell: (entry) =>
        entry.order_id ? (
          // Filters the statement to that order.
          <Link href={`/delivery-parties/${party.id}?order_id=${entry.order_id}`} className="hover:underline" dir="ltr" data-testid="statement-order">
            {entry.order_number ?? entry.order_id.slice(0, 8)}
          </Link>
        ) : (
          "—"
        ),
    },
    { key: "sku", header: t("statement.sku"), cell: (entry) => <span dir="ltr">{entry.sku}</span> },
    { key: "lot", header: t("statement.lot"), cell: (entry) => <span dir="ltr">{entry.lot_number ?? "—"}</span> },
    {
      key: "quantity",
      header: t("statement.quantity"),
      className: "text-end",
      cell: (entry) => (
        <span dir="ltr" data-testid="statement-quantity">
          {entry.quantity > 0 ? `+${qty(entry.quantity)}` : qty(entry.quantity)}
        </span>
      ),
    },
    {
      key: "running",
      header: t("statement.running"),
      className: "text-end",
      cell: (entry) => (
        <span dir="ltr" className="font-semibold" data-testid="statement-running">
          {qty(entry.running_quantity)}
        </span>
      ),
    },
    ...(showCost
      ? ([
          { key: "value", header: t("statement.value"), className: "text-end", cell: (entry) => <span dir="ltr">{cost(entry.value_iqd)}</span> },
          {
            key: "runningValue",
            header: t("statement.runningValue"),
            className: "text-end",
            cell: (entry) => (
              <span dir="ltr" data-testid="statement-running-value">
                {cost(entry.running_value_iqd)}
              </span>
            ),
          },
        ] satisfies Column<StatementEntry>[])
      : []),
  ];

  return (
    <div className="flex flex-col gap-6" data-testid="party-view" data-party={party.id}>
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <Badge tone={party.kind === "external_driver" ? "warning" : "info"} data-testid="party-kind" data-kind={party.kind}>
          {t(`kinds.${party.kind}`)}
        </Badge>
        <Badge tone={party.is_active ? "success" : "neutral"} data-testid="party-status" data-active={String(party.is_active)}>
          {party.is_active ? t("status.active") : t("status.inactive")}
        </Badge>
        <span dir="ltr">{party.phone}</span>
        {party.vehicle_number ? (
          <span>
            {t("columns.vehicle")}: <span dir="ltr">{party.vehicle_number}</span>
          </span>
        ) : null}
        {party.description ? <span className="text-text-muted">{party.description}</span> : null}
        {party.notes ? <span className="text-text-muted">{party.notes}</span> : null}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-2" data-testid="custody-goods">
          <h2 className="font-bold">{t("custody.goods")}</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-text-muted">{t("custody.quantity")}</dt>
            <dd dir="ltr" className="text-end font-semibold" data-testid="custody-goods-quantity">
              {qty(goods.quantity)}
            </dd>
            {showCost ? (
              <>
                <dt className="text-text-muted">{t("custody.value")}</dt>
                <dd dir="ltr" className="text-end font-semibold" data-testid="custody-goods-value">
                  {cost(goods.value_iqd)}
                </dd>
              </>
            ) : null}
            <dt className="text-text-muted">{t("custody.oldest")}</dt>
            <dd className="text-end" data-testid="custody-goods-age">
              {days(goods.oldest_age_days)}
            </dd>
          </dl>
        </Card>
        <Card className="flex flex-col gap-2" data-testid="custody-cash">
          <h2 className="font-bold">{t("custody.cash")}</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-text-muted">{t("custody.amount")}</dt>
            <dd dir="ltr" className="text-end font-semibold" data-testid="custody-cash-amount">
              {formatMoney(cash.amount, cash.currency, locale)}
            </dd>
            <dt className="text-text-muted">{t("custody.oldest")}</dt>
            <dd className="text-end" data-testid="custody-cash-age">
              {days(cash.oldest_age_days)}
            </dd>
          </dl>
        </Card>
      </div>

      <Card className="overflow-x-auto">
        <h2 className="mb-3 font-bold">{t("custody.lines")}</h2>
        {goods.lines.length === 0 ? (
          <p className="text-sm text-text-muted" data-testid="custody-empty">
            {t("custody.none")}
          </p>
        ) : (
          <table className="w-full text-sm" data-testid="custody-lines">
            <thead>
              <tr className="border-b border-border text-start">
                <th className="px-3 py-2 text-start font-semibold">{t("statement.order")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("custody.product")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("statement.sku")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("statement.lot")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("statement.quantity")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("custody.age")}</th>
                {showCost ? <th className="px-3 py-2 text-end font-semibold">{t("custody.unitCost")}</th> : null}
                {showCost ? <th className="px-3 py-2 text-end font-semibold">{t("custody.value")}</th> : null}
                {canRecordException ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {goods.lines.map((line) => (
                <tr key={line.holding_id} className="border-b border-border last:border-0" data-testid="custody-line" data-order={line.order.order_number}>
                  <td className="px-3 py-2">
                    <Link href={`/orders/${line.order.id}`} className="hover:underline" dir="ltr">
                      {line.order.order_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{locale === "ar" ? line.product.name_ar : line.product.name_en}</td>
                  <td className="px-3 py-2" dir="ltr">
                    {line.sku}
                  </td>
                  <td className="px-3 py-2" dir="ltr">
                    {line.lot_number ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-end" dir="ltr">
                    {qty(line.quantity)}
                  </td>
                  <td className="px-3 py-2 text-end" data-testid="custody-line-age">
                    {days(line.age_days)}
                  </td>
                  {showCost ? (
                    <td className="px-3 py-2 text-end" dir="ltr" data-testid="custody-line-cost">
                      {cost(line.unit_cost_iqd)}
                    </td>
                  ) : null}
                  {showCost ? (
                    <td className="px-3 py-2 text-end" dir="ltr">
                      {cost(line.value_iqd)}
                    </td>
                  ) : null}
                  {canRecordException ? (
                    <td className="px-3 py-2 text-end">
                      <Link href={`/finance/custody-exceptions/new?order_id=${line.order.id}`} className="font-semibold text-primary-dark hover:underline" data-testid="custody-line-exception">
                        {t("custody.exception")}
                      </Link>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="mb-3 font-bold">{t("held.title")}</h2>
        {held.length === 0 ? (
          <p className="text-sm text-text-muted">{t("held.none")}</p>
        ) : (
          <table className="w-full text-sm" data-testid="held-orders">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-start font-semibold">{t("statement.order")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("held.status")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("statement.quantity")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("held.since")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("custody.age")}</th>
              </tr>
            </thead>
            <tbody>
              {held.map((order) => (
                <tr key={order.id} className="border-b border-border last:border-0" data-testid="held-order" data-order={order.order_number}>
                  <td className="px-3 py-2">
                    <Link href={`/orders/${order.id}`} className="font-semibold text-primary-dark hover:underline" dir="ltr">
                      {order.order_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-3 py-2 text-end" dir="ltr">
                    {qty(order.quantity)}
                  </td>
                  <td className="px-3 py-2">{dateTime(order.held_since)}</td>
                  <td className="px-3 py-2 text-end">{days(order.age_days)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t("statement.title")}</h2>
        <p className="text-sm text-text-muted">{t("statement.hint")}</p>
        {orderFilter ? (
          <p className="text-sm" data-testid="statement-order-filter">
            {t("statement.forOrder", { number: filteredOrder ?? "…" })}{" "}
            <Link href={`/delivery-parties/${party.id}`} className="font-semibold text-primary-dark hover:underline">
              {t("statement.allOrders")}
            </Link>
          </p>
        ) : null}
        <DataTable
          testId="party-statement"
          caption={t("statement.title")}
          rows={statement}
          columns={columns}
          rowKey={(entry) => entry.id}
          state={statementState}
          emptyLabel={t("statement.empty")}
          toolbar={
            <>
              <DateFilter name="from" label={t("statement.from")} />
              <DateFilter name="to" label={t("statement.to")} />
            </>
          }
        />
      </section>

      <section className="flex flex-col gap-3" data-testid="party-cash-activity">
        <h2 className="text-lg font-bold">{t("cash.title")}</h2>
        <p className="text-sm text-text-muted">{t("cash.hint")}</p>
        {cashActivity.data.length === 0 ? (
          <p className="text-sm text-text-muted" data-testid="cash-activity-empty">
            {t("cash.empty")}
          </p>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="text-text-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-semibold">{t("statement.when")}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t("statement.event")}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t("cash.document")}</th>
                  <th className="px-3 py-2 text-end font-semibold">{t("cash.amount")}</th>
                  <th className="px-3 py-2 text-end font-semibold">{t("cash.unsettled")}</th>
                  <th className="px-3 py-2 text-end font-semibold">{t("cash.running")}</th>
                </tr>
              </thead>
              <tbody>
                {cashActivity.data.map((entry) => (
                  <tr key={`${entry.event}-${entry.id}`} className="border-t border-border" data-testid="cash-activity" data-event={entry.event}>
                    <td className="px-3 py-2">{dateTime(entry.occurred_at)}</td>
                    <td className="px-3 py-2">{t(`cashEvents.${entry.event}`)}</td>
                    <td className="px-3 py-2">
                      {entry.voucher_id ? (
                        <Link href={receiptHref(entry.voucher_id)} className="font-semibold text-primary-dark hover:underline" dir="ltr" data-testid="cash-activity-voucher">
                          {entry.voucher_document_number ?? entry.voucher_id.slice(0, 8)}
                        </Link>
                      ) : entry.order_id ? (
                        <Link href={`/orders/${entry.order_id}`} className="hover:underline" dir="ltr">
                          {entry.order_number ?? entry.order_id.slice(0, 8)}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {entry.allocation_orders.length && entry.voucher_id ? (
                        <span className="block text-xs text-text-muted" dir="ltr">
                          {entry.allocation_orders.map((allocation) => allocation.order_number).join(", ")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-end" dir="ltr" data-testid="cash-activity-amount">
                      {formatMoney(entry.amount_iqd, "IQD", locale)}
                    </td>
                    <td className="px-3 py-2 text-end" dir="ltr">
                      {entry.event === "collection_confirmed" ? formatMoney(entry.unsettled_amount_iqd, "IQD", locale) : "—"}
                    </td>
                    <td className="px-3 py-2 text-end font-semibold" dir="ltr" data-testid="cash-activity-running">
                      {formatMoney(entry.running_cash_iqd, "IQD", locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cashActivity.total > cashActivity.data.length ? (
              <p className="mt-2 text-xs text-text-muted">{t("cash.paged", { shown: cashActivity.data.length, total: cashActivity.total })}</p>
            ) : null}
          </Card>
        )}
      </section>

      {trips.length ? (
        <section className="flex flex-col gap-3" data-testid="party-trips">
          <h2 className="text-lg font-bold">{t("trips.title")}</h2>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-text-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-semibold">{t("trips.trip")}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t("trips.status")}</th>
                  <th className="px-3 py-2 text-end font-semibold">{t("trips.orders")}</th>
                  <th className="px-3 py-2 text-end font-semibold">{t("trips.expected")}</th>
                  <th className="px-3 py-2 text-end font-semibold">{t("trips.received")}</th>
                  <th className="px-3 py-2 text-end font-semibold">{t("trips.outstanding")}</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((trip) => (
                  <tr key={trip.id} className="border-t border-border" data-testid="party-trip" data-status={trip.status}>
                    <td className="px-3 py-2">
                      <Link href={tripHref(trip.id)} className="font-semibold text-primary-dark hover:underline" dir="ltr">
                        {trip.document_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{t(`trips.statuses.${trip.status}`)}</td>
                    <td className="px-3 py-2 text-end" dir="ltr">{trip.order_count}</td>
                    <td className="px-3 py-2 text-end" dir="ltr">{trip.expected_cash_iqd === null ? "—" : formatMoney(trip.expected_cash_iqd, "IQD", locale)}</td>
                    <td className="px-3 py-2 text-end" dir="ltr">{trip.received_cash_iqd === null ? "—" : formatMoney(trip.received_cash_iqd, "IQD", locale)}</td>
                    <td className="px-3 py-2 text-end font-semibold" dir="ltr">
                      {trip.outstanding_cash_iqd === null ? "—" : formatMoney(trip.outstanding_cash_iqd, "IQD", locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
