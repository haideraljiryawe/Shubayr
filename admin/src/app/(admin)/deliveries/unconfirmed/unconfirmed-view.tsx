"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Button } from "@/components/ui";
import { AmountFilter } from "@/components/finance/amount-filter";
import { DateFilter } from "@/components/finance/date-filter";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { CollectionFields, CollectionSummary } from "@/components/orders/collection-fields";
import { useStoreDateTime } from "@/components/orders/use-store-date";
import { DataTable, TableFilter, useTableUrl, type Column, type TableState } from "@/components/table/data-table";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { CollectionOperation, type DeliveryCollection } from "@/lib/collection";
import { formatMoney } from "@/lib/orders";

/**
 * The unconfirmed-collection queue, filtered by party, delivery day and
 * amount due (13.1) in the URL. "Confirm amount" records what the party
 * handed in, pre-filled with what is due: the full amount (later full) or
 * less, with the shortfall said before confirming (later short). Each
 * confirmation carries an operation id, so a double click or a retry posts
 * once.
 */
export function UnconfirmedView({
  rows,
  state,
  canConfirm,
  parties,
  ignored,
}: {
  rows: DeliveryCollection[];
  state: TableState;
  canConfirm: boolean;
  /** The party filter's choices. */
  parties: Array<{ value: string; label: string }>;
  ignored: Array<"dates" | "amounts">;
}) {
  const t = useTranslations("collections");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const dateTime = useStoreDateTime();
  const [confirming, setConfirming] = useState<DeliveryCollection | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [done, setDone] = useState<DeliveryCollection | null>(null);
  const operation = useRef(new CollectionOperation("admin-collection"));
  const money = (row: DeliveryCollection) => formatMoney(row.due_amount, row.currency, locale);
  const { searchParams } = useTableUrl();
  // A party from the URL that isn't among the choices (beyond the first 100,
  // or from a party page) is still shown as chosen.
  const chosen = searchParams.get("party_id");
  const named = rows.find((row) => row.party_id === chosen)?.party;
  const partyOptions =
    chosen && !parties.some((party) => party.value === chosen)
      ? [...parties, { value: chosen, label: named ? named.name : chosen.slice(0, 8) }]
      : parties;

  const columns: Column<DeliveryCollection>[] = [
    {
      key: "order",
      header: t("queue.columns.order"),
      cell: (row) => (
        <Link href={`/orders/${row.order_id}`} className="font-semibold text-primary-dark hover:underline" dir="ltr" data-testid="unconfirmed-order">
          {row.order?.order_number ?? row.order_id.slice(0, 8)}
        </Link>
      ),
    },
    {
      key: "party",
      header: t("queue.columns.party"),
      cell: (row) =>
        row.party ? (
          <Link href={`/delivery-parties/${row.party_id}`} className="hover:underline">
            {row.party.name}
          </Link>
        ) : (
          "—"
        ),
    },
    { key: "delivered", header: t("queue.columns.delivered"), cell: (row) => dateTime(row.delivered_at) },
    {
      key: "due",
      header: t("fields.due"),
      className: "text-end",
      cell: (row) => (
        <span dir="ltr" className="font-semibold">
          {money(row)}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("queue.columns.actions")}</span>,
      className: "text-end",
      cell: (row) =>
        canConfirm ? (
          <Button
            size="sm"
            data-testid="unconfirmed-confirm"
            onClick={() => {
              setDone(null);
              setAmount(String(row.due_amount));
              setConfirming(row);
            }}
          >
            {t("queue.confirm")}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {done ? (
        <Alert tone={done.status === "confirmed_full" ? "success" : "info"} data-testid="unconfirmed-done" data-status={done.status}>
          <p className="mb-2 font-semibold">{t("queue.done", { number: done.order?.order_number ?? "" })}</p>
          <CollectionSummary collection={done} />
        </Alert>
      ) : null}
      {ignored.map((range) => (
        <Alert key={range} tone="info" data-testid={`collections-ignored-${range}`}>
          {t(`filters.ignored.${range}`)}
        </Alert>
      ))}
      <DataTable
        testId="unconfirmed-table"
        caption={t("queue.title")}
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        state={state}
        emptyLabel={t("queue.empty")}
        toolbar={
          <>
            <TableFilter name="party_id" label={t("filters.party")} options={[{ value: "", label: t("filters.anyParty") }, ...partyOptions]} />
            <DateFilter name="date_from" label={t("filters.from")} />
            <DateFilter name="date_to" label={t("filters.to")} />
            <AmountFilter name="amount_min" label={t("filters.amountMin")} />
            <AmountFilter name="amount_max" label={t("filters.amountMax")} />
          </>
        }
      />
      <p className="text-xs text-text-muted">{t("filters.note")}</p>
      <ConfirmDialog
        open={confirming !== null}
        requireReason={false}
        tone="primary"
        title={t("queue.confirmTitle", { number: confirming?.order?.order_number ?? "" })}
        body={t("queue.confirmBody")}
        confirmLabel={t("queue.confirm")}
        onClose={() => setConfirming(null)}
        onConfirm={async () => {
          if (!confirming) return;
          if (amount === null) throw new ApiError(422, t("fields.amountInvalid"));
          const confirmed = await unwrap(
            browserApi.POST("/admin/deliveries/{id}/collection-confirmation", {
              params: { path: { id: confirming.delivery_id } },
              body: { operation_id: operation.current.id(confirming.delivery_id, amount), collected_amount: amount },
            }),
          );
          setDone(confirmed);
          toast(t(`status.${confirmed.status}`));
          router.refresh();
        }}
      >
        {confirming ? (
          <CollectionFields
            due={confirming.due_amount}
            currency={confirming.currency}
            choice="confirmed"
            onChoice={() => undefined}
            amount={amount}
            onAmount={setAmount}
            allowUnconfirmed={false}
          />
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
