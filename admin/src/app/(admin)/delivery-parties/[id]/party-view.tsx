"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Badge, Card } from "@/components/ui";
import { DateFilter } from "@/components/finance/date-filter";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { useStoreDateTime } from "@/components/orders/use-store-date";
import { DataTable, type Column, type TableState } from "@/components/table/data-table";
import { PARTY_TONE, isIssue, type CashActivity, type HeldOrder, type PartyCustody, type StatementEntry } from "@/lib/delivery-parties";
import { receiptHref } from "@/lib/finance/cash-receipts";
import { tripHref } from "@/lib/trips";
import type { components } from "@/types/api";

type TripStatement = components["schemas"]["ExternalDriverTripStatement"];
import { formatCost, formatQuantity } from "@/lib/inventory";
import { formatMoney } from "@/lib/orders";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/table/table";

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
  /** Independently paged cash in and out of the party's custody (14.0). */
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
      cell: (entry) => (
        <span dir="ltr" data-testid="statement-quantity">
          {entry.quantity > 0 ? `+${qty(entry.quantity)}` : qty(entry.quantity)}
        </span>
      ),
    },
    {
      key: "running",
      header: t("statement.running"),
      cell: (entry) => (
        <span dir="ltr" className="font-semibold" data-testid="statement-running">
          {qty(entry.running_quantity)}
        </span>
      ),
    },
    ...(showCost
      ? ([
          { key: "value", header: t("statement.value"), cell: (entry) => <span dir="ltr">{cost(entry.value_iqd)}</span> },
          {
            key: "runningValue",
            header: t("statement.runningValue"),
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
        <Badge tone={PARTY_TONE[party.kind]} data-testid="party-kind" data-kind={party.kind}>
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
          <Table data-testid="custody-lines">
            <THead>
              <Tr className="text-start">
                <Th>{t("statement.order")}</Th>
                <Th>{t("custody.product")}</Th>
                <Th>{t("statement.sku")}</Th>
                <Th>{t("statement.lot")}</Th>
                <Th>{t("statement.quantity")}</Th>
                <Th>{t("custody.age")}</Th>
                {showCost ? <Th>{t("custody.unitCost")}</Th> : null}
                {showCost ? <Th>{t("custody.value")}</Th> : null}
                {canRecordException ? <Th /> : null}
              </Tr>
            </THead>
            <TBody>
              {goods.lines.map((line) => (
                <Tr key={line.holding_id} data-testid="custody-line" data-order={line.order.order_number}>
                  <Td>
                    <Link href={`/orders/${line.order.id}`} className="hover:underline" dir="ltr">
                      {line.order.order_number}
                    </Link>
                  </Td>
                  <Td>{locale === "ar" ? line.product.name_ar : line.product.name_en}</Td>
                  <Td dir="ltr">
                    {line.sku}
                  </Td>
                  <Td dir="ltr">
                    {line.lot_number ?? "—"}
                  </Td>
                  <Td dir="ltr">
                    {qty(line.quantity)}
                  </Td>
                  <Td data-testid="custody-line-age">
                    {days(line.age_days)}
                  </Td>
                  {showCost ? (
                    <Td dir="ltr" data-testid="custody-line-cost">
                      {cost(line.unit_cost_iqd)}
                    </Td>
                  ) : null}
                  {showCost ? (
                    <Td dir="ltr">
                      {cost(line.value_iqd)}
                    </Td>
                  ) : null}
                  {canRecordException ? (
                    <Td align="end">
                      <Link href={`/finance/custody-exceptions/new?order_id=${line.order.id}`} className="font-semibold text-primary-dark hover:underline" data-testid="custody-line-exception">
                        {t("custody.exception")}
                      </Link>
                    </Td>
                  ) : null}
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="mb-3 font-bold">{t("held.title")}</h2>
        {held.length === 0 ? (
          <p className="text-sm text-text-muted">{t("held.none")}</p>
        ) : (
          <Table data-testid="held-orders">
            <THead>
              <Tr>
                <Th>{t("statement.order")}</Th>
                <Th>{t("held.status")}</Th>
                <Th>{t("statement.quantity")}</Th>
                <Th>{t("held.since")}</Th>
                <Th>{t("custody.age")}</Th>
              </Tr>
            </THead>
            <TBody>
              {held.map((order) => (
                <Tr key={order.id} data-testid="held-order" data-order={order.order_number}>
                  <Td>
                    <Link href={`/orders/${order.id}`} className="font-semibold text-primary-dark hover:underline" dir="ltr">
                      {order.order_number}
                    </Link>
                  </Td>
                  <Td>
                    <OrderStatusBadge status={order.status} />
                  </Td>
                  <Td dir="ltr">
                    {qty(order.quantity)}
                  </Td>
                  <Td>{dateTime(order.held_since)}</Td>
                  <Td>{days(order.age_days)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
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
            <Table minWidth="48rem">
              <THead>
                <Tr>
                  <Th>{t("statement.when")}</Th>
                  <Th>{t("statement.event")}</Th>
                  <Th>{t("cash.document")}</Th>
                  <Th>{t("cash.amount")}</Th>
                  <Th>{t("cash.unsettled")}</Th>
                  <Th>{t("cash.running")}</Th>
                </Tr>
              </THead>
              <TBody>
                {cashActivity.data.map((entry) => (
                  <Tr key={`${entry.event}-${entry.id}`} data-testid="cash-activity" data-event={entry.event}>
                    <Td>{dateTime(entry.occurred_at)}</Td>
                    <Td>{t(`cashEvents.${entry.event}`)}</Td>
                    <Td>
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
                    </Td>
                    <Td dir="ltr" data-testid="cash-activity-amount">
                      {formatMoney(entry.amount_iqd, "IQD", locale)}
                    </Td>
                    <Td dir="ltr">
                      {entry.event === "collection_confirmed" ? formatMoney(entry.unsettled_amount_iqd, "IQD", locale) : "—"}
                    </Td>
                    <Td className="font-semibold" dir="ltr" data-testid="cash-activity-running">
                      {formatMoney(entry.running_cash_iqd, "IQD", locale)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
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
            <Table minWidth="40rem">
              <THead>
                <Tr>
                  <Th>{t("trips.trip")}</Th>
                  <Th>{t("trips.status")}</Th>
                  <Th>{t("trips.orders")}</Th>
                  <Th>{t("trips.expected")}</Th>
                  <Th>{t("trips.received")}</Th>
                  <Th>{t("trips.outstanding")}</Th>
                </Tr>
              </THead>
              <TBody>
                {trips.map((trip) => (
                  <Tr key={trip.id} data-testid="party-trip" data-status={trip.status}>
                    <Td>
                      <Link href={tripHref(trip.id)} className="font-semibold text-primary-dark hover:underline" dir="ltr">
                        {trip.document_number}
                      </Link>
                    </Td>
                    <Td>{t(`trips.statuses.${trip.status}`)}</Td>
                    <Td dir="ltr">{trip.order_count}</Td>
                    <Td dir="ltr">{trip.expected_cash_iqd === null ? "—" : formatMoney(trip.expected_cash_iqd, "IQD", locale)}</Td>
                    <Td dir="ltr">{trip.received_cash_iqd === null ? "—" : formatMoney(trip.received_cash_iqd, "IQD", locale)}</Td>
                    <Td className="font-semibold" dir="ltr">
                      {trip.outstanding_cash_iqd === null ? "—" : formatMoney(trip.outstanding_cash_iqd, "IQD", locale)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
