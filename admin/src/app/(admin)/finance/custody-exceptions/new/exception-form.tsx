"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Button, Card, Select, Textarea } from "@/components/ui";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { ExceptionPostingStatus } from "@/components/finance/exception-status";
import { usePosting } from "@/components/finance/use-posting";
import { DocumentDateFields, documentDateError, type DocumentDateValue } from "@/components/purchasing/document-date";
import { browserApi, unwrap } from "@/lib/api/client";
import { errorKind } from "@/lib/api/errors";
import type { CashAccountOption } from "@/lib/api/purchasing-server";
import type { DeliveryCollection } from "@/lib/collection";
import {
  holdingLines,
  refundCap,
  returnValue,
  type CustodyException,
  type CustodyLine,
  type ExceptionType,
} from "@/lib/finance/custody-exceptions";
import { OperationKey } from "@/lib/finance/cash-receipts";
import { fixedText, moneyText, toFixed } from "@/lib/purchasing";
import { cn } from "@/lib/cn";
import type { components } from "@/types/api";

type AdminOrder = components["schemas"]["AdminOrder"];

export function ExceptionForm({
  order,
  partyId,
  holdings,
  collection,
  refunds,
  cashAccounts,
  locations,
  allowed,
  initialType,
  canDeliver,
  canBackdate,
  today,
  windowDays,
}: {
  order: AdminOrder;
  partyId: string | null;
  /** The order's goods still in the party's custody. */
  holdings: CustodyLine[];
  /** The order's delivered collection, from the party's collection list. */
  collection: DeliveryCollection | null;
  /** Active delivery-fee refunds already made on the order. */
  refunds: CustodyException[];
  cashAccounts: CashAccountOption[];
  locations: Array<{ id: string; label: string }>;
  allowed: readonly ExceptionType[];
  initialType: ExceptionType;
  canDeliver: boolean;
  canBackdate: boolean;
  today: string;
  windowDays: number;
}) {
  const t = useTranslations("custodyExceptions.create");
  const tTrips = useTranslations("trips");
  const [type, setType] = useState<ExceptionType>(initialType);

  return (
    <div className="flex flex-col gap-6" data-testid="exception-form" data-order={order.id}>
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span>
          {t("order")}:{" "}
          <Link href={`/orders/${order.id}`} className="font-semibold text-primary-dark hover:underline" dir="ltr">
            {order.order_number}
          </Link>
        </span>
        <span>
          {t("party")}:{" "}
          {partyId ? (
            <Link href={`/delivery-parties/${partyId}`} className="font-semibold text-primary-dark hover:underline" data-testid="exception-party">
              {order.delivery?.party?.name}
            </Link>
          ) : (
            "—"
          )}
        </span>
        <span>
          {t("deliveryStatus")}: <span data-testid="exception-delivery-status" data-status={order.delivery?.status ?? ""}>
            {order.delivery?.status ? tTrips(`deliveryStatuses.${order.delivery.status}`) : "—"}
          </span>
        </span>
      </Card>

      {allowed.length > 1 ? (
        <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label={t("kinds")}>
          {allowed.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-current={type === kind ? "page" : undefined}
              onClick={() => setType(kind)}
              data-testid={`exception-type-${kind}`}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold",
                type === kind ? "border-primary-dark text-primary-dark" : "border-transparent text-text-muted hover:text-text",
              )}
            >
              {t(`types.${kind}`)}
            </button>
          ))}
        </nav>
      ) : null}

      {type === "goods_loss" ? (
        <LossForm key="loss" order={order} partyId={partyId} holdings={holdings} canBackdate={canBackdate} today={today} windowDays={windowDays} />
      ) : type === "return_against_uncollected" ? (
        <ReturnForm
          key="return"
          order={order}
          partyId={partyId}
          holdings={holdings}
          collection={collection}
          locations={locations}
          canDeliver={canDeliver}
          canBackdate={canBackdate}
          today={today}
          windowDays={windowDays}
        />
      ) : (
        <RefundForm
          key="refund"
          order={order}
          partyId={partyId}
          collection={collection}
          refunds={refunds}
          cashAccounts={cashAccounts}
          canBackdate={canBackdate}
          today={today}
          windowDays={windowDays}
        />
      )}
    </div>
  );
}

/** Reason and document date, the fields every exception shares. */
function CommonFields({
  reason,
  onReason,
  date,
  onDate,
  attempted,
  locked,
  canBackdate,
  today,
  windowDays,
}: {
  reason: string;
  onReason: (value: string) => void;
  date: DocumentDateValue;
  onDate: (value: DocumentDateValue) => void;
  attempted: boolean;
  locked: boolean;
  canBackdate: boolean;
  today: string;
  windowDays: number;
}) {
  const t = useTranslations("custodyExceptions.create");
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Field label={t("reason")} name="reason" error={attempted && reason.trim().length < 3 ? t("errors.reason") : null}>
        <Textarea value={reason} maxLength={500} rows={2} disabled={locked} onChange={(event) => onReason(event.target.value)} data-testid="exception-reason" />
      </Field>
      <DocumentDateFields value={date} onChange={onDate} today={today} windowDays={windowDays} canBackdate={canBackdate} showErrors={attempted} disabled={locked} testId="exception" />
    </div>
  );
}

/** The order's goods in custody with a quantity per holding (lot shown). */
function HoldingsTable({
  holdings,
  typed,
  generation,
  onTyped,
  locked,
  label,
}: {
  holdings: CustodyLine[];
  typed: Record<string, string>;
  generation: number;
  onTyped: (next: Record<string, string>) => void;
  locked: boolean;
  label: string;
}) {
  const t = useTranslations("custodyExceptions.create");
  const locale = useLocale();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm" data-testid="exception-holdings">
        <thead className="text-text-muted">
          <tr>
            <th className="px-3 py-2 text-start font-semibold">{t("product")}</th>
            <th className="px-3 py-2 text-start font-semibold">{t("lot")}</th>
            <th className="px-3 py-2 text-end font-semibold">{t("held")}</th>
            <th className="w-40 px-3 py-2 text-start font-semibold">{label}</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((holding) => (
            <tr key={holding.holding_id} className="border-t border-border" data-testid="exception-holding" data-holding={holding.holding_id}>
              <td className="px-3 py-2">{locale === "ar" ? holding.product.name_ar : holding.product.name_en}</td>
              <td className="px-3 py-2" dir="ltr">
                {holding.lot_number ?? "—"} <span className="text-text-muted">{holding.sku}</span>
              </td>
              <td className="px-3 py-2 text-end" dir="ltr">
                {holding.quantity}
              </td>
              <td className="px-3 py-2">
                <DecimalInput
                  key={`${holding.holding_id}-${generation}`}
                  value={typed[holding.holding_id] ?? ""}
                  parse={{ maxDecimals: 3 }}
                  className="h-9"
                  disabled={locked}
                  aria-label={label}
                  onValueChange={(_, text) => onTyped({ ...typed, [holding.holding_id]: text.trim() })}
                  data-testid="exception-quantity"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Unavailable({ text }: { text: string }) {
  return (
    <Alert tone="info" data-testid="exception-unavailable">
      {text}
    </Alert>
  );
}

/** Goods lost or damaged in custody: which holdings, how many, and who bears the cost. */
function LossForm({
  order,
  partyId,
  holdings,
  canBackdate,
  today,
  windowDays,
}: {
  order: AdminOrder;
  partyId: string | null;
  holdings: CustodyLine[];
  canBackdate: boolean;
  today: string;
  windowDays: number;
}) {
  const t = useTranslations("custodyExceptions.create");
  const router = useRouter();
  const posting = usePosting<CustodyException>();
  const operation = useRef(new OperationKey());
  // Read once: recording the loss empties the order's custody and refreshes the page.
  const [kept] = useState(() => ({ holdings, status: order.status ?? "" }));
  const [typed, setTyped] = useState<Record<string, string>>(() => Object.fromEntries(holdings.map((holding) => [holding.holding_id, String(holding.quantity)])));
  const [bearer, setBearer] = useState<"store" | "party" | "">("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState<DocumentDateValue>({ date: today, backdateReason: "" });
  const [attempted, setAttempted] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(null);
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";
  const posted = posting.state.phase === "posted";
  const plan = holdingLines(kept.holdings, typed);

  if (!partyId || kept.holdings.length === 0 || !["dispatched", "failed", "cancelled"].includes(kept.status)) {
    return <Unavailable text={t("unavailable.goods_loss")} />;
  }

  async function submit() {
    setAttempted(true);
    if (!bearer || plan.lines.length === 0 || plan.problems.length || reason.trim().length < 3 || documentDateError(date, today, windowDays, canBackdate)) return;
    const payload = {
      document_date: date.date,
      ...(date.backdateReason.trim() ? { backdate_reason: date.backdateReason.trim() } : {}),
      order_id: order.id!,
      liability_bearer: bearer,
      reason: reason.trim(),
      lines: plan.lines,
    };
    const id = operation.current.id(JSON.stringify(payload));
    setOperationId(id);
    const settled = await posting.post(id, () => unwrap(browserApi.POST("/admin/custody-exceptions/goods-loss", { body: { operation_id: id, ...payload } })));
    if (settled?.phase === "posted") router.refresh();
  }

  return (
    <Card className="flex flex-col gap-4" data-testid="exception-loss">
      <p className="text-sm text-text-muted">{t("lossBody")}</p>
      <HoldingsTable holdings={kept.holdings} typed={typed} generation={0} onTyped={setTyped} locked={busy || posted} label={t("lostQuantity")} />
      <fieldset className="flex flex-col gap-2 text-sm" disabled={busy || posted}>
        <legend className="mb-1 font-semibold">{t("bearer")}</legend>
        {(["store", "party"] as const).map((value) => (
          <label key={value} className="flex items-start gap-2">
            <input type="radio" name="bearer" className="mt-1" checked={bearer === value} onChange={() => setBearer(value)} data-testid={`exception-bearer-${value}`} />
            <span className="flex flex-col">
              <span>{t(`bearers.${value}`)}</span>
              <span className="text-xs text-text-muted">{t(`bearerHints.${value}`)}</span>
            </span>
          </label>
        ))}
        {attempted && !bearer ? <p className="text-xs font-semibold text-error-dark" data-testid="exception-bearer-error">{t("errors.bearer")}</p> : null}
      </fieldset>
      <CommonFields reason={reason} onReason={setReason} date={date} onDate={setDate} attempted={attempted} locked={busy || posted} canBackdate={canBackdate} today={today} windowDays={windowDays} />
      {attempted && (plan.lines.length === 0 || plan.problems.length) ? <p className="text-sm font-semibold text-error-dark" role="alert">{t("errors.quantities")}</p> : null}
      {operationId ? <ExceptionPostingStatus state={posting.state} partyId={partyId} onRetry={() => void submit()} onCheck={() => void posting.check(operationId)} /> : null}
      {posted ? null : (
        <div className="flex justify-end">
          <Button pending={busy} onClick={() => void submit()} data-testid="exception-submit">
            {t("submit.goods_loss")}
          </Button>
        </div>
      )}
    </Card>
  );
}

/**
 * Goods returned at the door: the order is delivered with what the customer
 * paid, and the goods they refused go back into stock against what was left
 * uncollected (13.3). Recorded while the order is still out for delivery —
 * the goods it held are read then; once delivered, the API offers no read of
 * them, so a return cannot be recorded afterwards from here.
 */
function ReturnForm({
  order,
  partyId,
  holdings,
  collection,
  locations,
  canDeliver,
  canBackdate,
  today,
  windowDays,
}: {
  order: AdminOrder;
  partyId: string | null;
  holdings: CustodyLine[];
  collection: DeliveryCollection | null;
  locations: Array<{ id: string; label: string }>;
  canDeliver: boolean;
  canBackdate: boolean;
  today: string;
  windowDays: number;
}) {
  const t = useTranslations("custodyExceptions.create");
  const locale = useLocale();
  const router = useRouter();
  const delivery = usePosting<unknown>();
  const posting = usePosting<CustodyException>();
  const deliveryOperation = useRef(new OperationKey());
  const operation = useRef(new OperationKey());
  // Read once: after the delivery the API no longer lists these holdings.
  const [kept] = useState(holdings);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [locationId, setLocationId] = useState(locations.length === 1 ? locations[0].id : "");
  const [collectedText, setCollectedText] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState<DocumentDateValue>({ date: today, backdateReason: "" });
  const [attempted, setAttempted] = useState(false);
  const [delivered, setDelivered] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(null);
  const money = (value: bigint) => moneyText(value, "IQD", 0, locale);
  const busy = delivery.state.phase === "posting" || delivery.state.phase === "checking" || posting.state.phase === "posting" || posting.state.phase === "checking";
  const posted = posting.state.phase === "posted";
  const items = (order.items ?? []).map((item) => ({ variantId: item.variant_id ?? "", quantity: item.quantity ?? 0, lineTotal: item.line_total ?? 0 }));
  const value = returnValue(kept, typed, items);
  const due = toFixed(order.total ?? 0);
  const suggested = due > value ? due - value : 0n;
  const collected = collectedText ?? fixedText(suggested, 0);
  const plan = holdingLines(kept, typed);

  const outForDelivery = order.delivery?.status === "out_for_delivery";
  if (!partyId) return <Unavailable text={t("unavailable.return_against_uncollected")} />;
  if (!delivered && !outForDelivery) {
    return (
      <Unavailable
        text={
          collection?.status === "confirmed_short" && (collection.uncollected_amount_iqd ?? 0) > 0
            ? t("unavailable.returnAfterDelivery")
            : t("unavailable.return_against_uncollected")
        }
      />
    );
  }
  if (!canDeliver) return <Unavailable text={t("unavailable.returnNeedsDeliver")} />;

  function problems() {
    const found: string[] = [];
    if (plan.lines.length === 0 || plan.problems.length) found.push(t("errors.quantities"));
    if (!locationId) found.push(t("errors.location"));
    if (!/^\d+$/.test(collected) || toFixed(collected) >= due) found.push(t("errors.collected"));
    if (reason.trim().length < 3) found.push(t("errors.reason"));
    if (documentDateError(date, today, windowDays, canBackdate)) found.push(t("errors.date"));
    return found;
  }

  async function submit() {
    setAttempted(true);
    if (problems().length) return;
    // Step 1: delivered with what was collected (confirmed), unless done already.
    if (!delivered) {
      const body = {
        status: "delivered" as const,
        order_version: order.version!,
        collection_confirmation: "confirmed" as const,
        collected_amount: collected,
        source: "web_admin",
      };
      const id = deliveryOperation.current.id(JSON.stringify(body));
      const step = await delivery.post(id, () =>
        unwrap(browserApi.PATCH("/admin/deliveries/{id}/status", { params: { path: { id: order.delivery!.id! } }, body: { ...body, operation_id: id } })),
      );
      if (step?.phase !== "posted") return;
      setDelivered(true);
    }
    // Step 2: the refused goods back into stock against the shortfall.
    const payload = {
      document_date: date.date,
      ...(date.backdateReason.trim() ? { backdate_reason: date.backdateReason.trim() } : {}),
      order_id: order.id!,
      reason: reason.trim(),
      lines: plan.lines.map((line) => ({ ...line, location_id: locationId })),
    };
    const id = operation.current.id(JSON.stringify(payload));
    setOperationId(id);
    const settled = await posting.post(id, () => unwrap(browserApi.POST("/admin/custody-exceptions/return-against-uncollected", { body: { operation_id: id, ...payload } })));
    if (settled?.phase === "posted") router.refresh();
  }

  const shown = attempted && !posted ? problems() : [];
  return (
    <Card className="flex flex-col gap-4" data-testid="exception-return">
      <p className="text-sm text-text-muted">{t("returnBody")}</p>
      <HoldingsTable holdings={kept} typed={typed} generation={0} onTyped={setTyped} locked={busy || delivered} label={t("returnedQuantity")} />
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={t("location")} name="location_id">
          <Select value={locationId} disabled={busy || posted} onChange={(event) => setLocationId(event.target.value)} data-testid="exception-location">
            <option value="">{t("pickLocation")}</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("collected")} name="collected_amount" hint={t("collectedHint", { due: money(due), value: money(value) })}>
          <DecimalInput
            key={`collected-${fixedText(suggested, 0)}`}
            value={collected}
            parse={{ maxDecimals: 0 }}
            disabled={busy || delivered}
            onValueChange={(_, text) => setCollectedText(text.trim())}
            data-testid="exception-collected"
          />
        </Field>
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">{t("returnValue")}</span>
          <span className="font-bold" dir="ltr" data-testid="exception-return-value">
            {money(value)}
          </span>
        </div>
      </div>
      <CommonFields reason={reason} onReason={setReason} date={date} onDate={setDate} attempted={attempted} locked={busy || posted} canBackdate={canBackdate} today={today} windowDays={windowDays} />
      {shown.length ? (
        <ul className="list-inside list-disc rounded-md bg-error/5 p-3 text-sm font-semibold text-error-dark" role="alert" data-testid="exception-problems">
          {shown.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      {delivery.state.phase === "error" ? <FormError kind={errorKind(delivery.state.error)} detail={delivery.state.error.message} /> : null}
      {delivered && !posted ? (
        <Alert tone="info" data-testid="exception-delivered">
          {t("deliveredFirst")}
        </Alert>
      ) : null}
      {operationId ? <ExceptionPostingStatus state={posting.state} partyId={partyId} onRetry={() => void submit()} onCheck={() => void posting.check(operationId)} /> : null}
      {posted ? null : (
        <div className="flex justify-end">
          <Button pending={busy} onClick={() => void submit()} data-testid="exception-submit">
            {delivered ? t("submit.returnOnly") : t("submit.return_against_uncollected")}
          </Button>
        </div>
      )}
    </Card>
  );
}

/** A refund of the delivery fee, capped at what was charged less earlier refunds. */
function RefundForm({
  order,
  partyId,
  collection,
  refunds,
  cashAccounts,
  canBackdate,
  today,
  windowDays,
}: {
  order: AdminOrder;
  partyId: string | null;
  collection: DeliveryCollection | null;
  refunds: CustodyException[];
  cashAccounts: CashAccountOption[];
  canBackdate: boolean;
  today: string;
  windowDays: number;
}) {
  const t = useTranslations("custodyExceptions.create");
  const locale = useLocale();
  const router = useRouter();
  const posting = usePosting<CustodyException>();
  const operation = useRef(new OperationKey());
  const [method, setMethod] = useState<"cash_account" | "uncollected">("cash_account");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(cashAccounts.length === 1 ? cashAccounts[0].id : "");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState<DocumentDateValue>({ date: today, backdateReason: "" });
  const [attempted, setAttempted] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(null);
  const money = (value: bigint) => moneyText(value, "IQD", 0, locale);
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";
  const posted = posting.state.phase === "posted";
  const fee = order.delivery_fee ?? 0;
  const cap = refundCap({ fee, refunded: refunds, uncollected: collection?.uncollected_amount_iqd ?? null, method });
  const typed = /^\d+$/.test(amount.trim()) ? toFixed(amount.trim()) : null;

  if (!collection || fee <= 0) return <Unavailable text={t("unavailable.delivery_fee_refund")} />;
  // Fully refunded already (and not just now): nothing left to offer.
  const left = refundCap({ fee, refunded: refunds, uncollected: null, method: "cash_account" });
  if (left === 0n && !posted && posting.state.phase !== "error") return <Unavailable text={t("unavailable.fullyRefunded")} />;

  const problems = [
    ...(typed === null || typed <= 0n ? [t("errors.amount")] : typed > cap ? [t("errors.overCap", { cap: money(cap) })] : []),
    ...(method === "cash_account" && !accountId ? [t("errors.cash")] : []),
    ...(reason.trim().length < 3 ? [t("errors.reason")] : []),
    ...(documentDateError(date, today, windowDays, canBackdate) ? [t("errors.date")] : []),
  ];

  async function submit() {
    setAttempted(true);
    if (problems.length) return;
    const payload = {
      document_date: date.date,
      ...(date.backdateReason.trim() ? { backdate_reason: date.backdateReason.trim() } : {}),
      order_id: order.id!,
      amount_iqd: amount.trim(),
      settlement_method: method,
      ...(method === "cash_account" ? { cash_account_id: accountId } : {}),
      reason: reason.trim(),
    };
    const id = operation.current.id(JSON.stringify(payload));
    setOperationId(id);
    const settled = await posting.post(id, () => unwrap(browserApi.POST("/admin/custody-exceptions/delivery-fee-refund", { body: { operation_id: id, ...payload } })));
    if (settled?.phase === "posted") router.refresh();
  }

  return (
    <Card className="flex flex-col gap-4" data-testid="exception-refund">
      <p className="text-sm text-text-muted">{t("refundBody", { fee: money(toFixed(fee)) })}</p>
      <p className="text-sm font-semibold" data-testid="exception-refund-cap" data-cap={fixedText(cap, 0)}>
        {t("refundCap", { cap: money(cap) })}
      </p>
      <fieldset className="flex flex-col gap-2 text-sm" disabled={busy || posted}>
        <legend className="mb-1 font-semibold">{t("refundMethod")}</legend>
        {(["cash_account", "uncollected"] as const).map((value) => (
          <label key={value} className="flex items-start gap-2">
            <input type="radio" name="method" className="mt-1" checked={method === value} onChange={() => setMethod(value)} data-testid={`exception-method-${value}`} />
            <span>{t(`methods.${value}`)}</span>
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={t("refundAmount")} name="amount_iqd">
          <DecimalInput value="" parse={{ maxDecimals: 0 }} disabled={busy || posted} onValueChange={(_, text) => setAmount(text.trim())} data-testid="exception-amount" />
        </Field>
        {method === "cash_account" ? (
          <Field label={t("cashAccount")} name="cash_account_id">
            <Select value={accountId} disabled={busy || posted} onChange={(event) => setAccountId(event.target.value)} data-testid="exception-cash-account">
              <option value="">{t("pickCash")}</option>
              {cashAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      <CommonFields reason={reason} onReason={setReason} date={date} onDate={setDate} attempted={attempted} locked={busy || posted} canBackdate={canBackdate} today={today} windowDays={windowDays} />
      {attempted && problems.length && !posted ? (
        <ul className="list-inside list-disc rounded-md bg-error/5 p-3 text-sm font-semibold text-error-dark" role="alert" data-testid="exception-problems">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      {operationId ? <ExceptionPostingStatus state={posting.state} partyId={partyId ?? undefined} onRetry={() => void submit()} onCheck={() => void posting.check(operationId)} /> : null}
      {posted ? null : (
        <div className="flex justify-end">
          <Button pending={busy} onClick={() => void submit()} data-testid="exception-submit">
            {t("submit.delivery_fee_refund")}
          </Button>
        </div>
      )}
    </Card>
  );
}
