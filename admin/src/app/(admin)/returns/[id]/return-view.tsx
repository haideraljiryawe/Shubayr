"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Check, Circle, CircleDot, Minus } from "lucide-react";
import { Alert, Card } from "@/components/ui";
import { entryHref } from "@/lib/finance/links";
import { cn } from "@/lib/cn";
import { moneyText, toFixed } from "@/lib/purchasing";
import {
  ACTION_PERMISSION,
  eventActor,
  nextAction,
  quantityText,
  stepStates,
  type Return,
  type ReturnAction,
} from "@/lib/returns";
import { ReturnStatusBadge } from "../status-badge";
import { ApprovePanel, InspectPanel, ReceivePanel, RefundPanel } from "./action-panels";

export interface CustomerInfo {
  name: string | null;
  phone: string;
}

export interface LocationChoice {
  id: string;
  code: string;
  warehouse: string;
  sellable: boolean;
  active: boolean;
}

export interface CollectionChoice {
  id: string;
  partyId: string;
  collected: number | null;
  status: "confirmed_full" | "confirmed_short" | "unconfirmed";
}

export function ReturnView({
  ret,
  permissions,
  action,
  customer,
  deliveryFee,
  locations,
  cashAccounts,
  collection,
}: {
  ret: Return;
  permissions: readonly string[];
  /** The next step, when this person may take it. */
  action: ReturnAction | null;
  customer: CustomerInfo | null;
  deliveryFee: number | null;
  locations: LocationChoice[];
  /** Null: the person can't list cash accounts (cash_accounts.view). */
  cashAccounts: Array<{ id: string; name: string }> | null;
  collection: CollectionChoice | null;
}) {
  const t = useTranslations("returns");
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const [notice, setNotice] = useState<ReturnAction | null>(null);
  const money = (value: number) => moneyText(toFixed(value), "IQD", 0, locale);
  const moment = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn", timeZone: "Asia/Baghdad" });
  const day = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium", numberingSystem: "latn", timeZone: "UTC" });
  const name = (item: Return["items"][number]) => (locale === "ar" ? item.product_name_ar : item.product_name_en) || item.product_name_ar;
  const pending = nextAction(ret.status);
  const settled = ret.status === "refunded" || ret.status === "completed";
  const reviewed = !["requested", "rejected"].includes(ret.status);
  const inspected = ["inspected", "refunded", "completed"].includes(ret.status);
  const canViewLedger = permissions.includes("ledger.view");

  const posted = (step: ReturnAction) => {
    setNotice(step);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6" data-testid="return-view" data-status={ret.status}>
      {notice ? (
        <Alert tone="success" data-testid="return-notice" data-step={notice}>
          {t(`detail.done.${notice}`)}
        </Alert>
      ) : null}

      <Card className="grid gap-4 text-sm md:grid-cols-4">
        <Item label={t("detail.status")}>
          <ReturnStatusBadge status={ret.status} testId="return-status" />
        </Item>
        <Item label={t("detail.order")}>
          <Link href={`/orders/${ret.order_id}`} className="font-semibold text-primary-dark hover:underline" dir="ltr" data-testid="return-order">
            {ret.order_number}
          </Link>
        </Item>
        <Item label={t("detail.customer")}>
          {customer ? (
            <span data-testid="return-customer">
              {customer.name ?? t("detail.noName")}{" "}
              <span dir="ltr" className="text-text-muted">
                {customer.phone}
              </span>
            </span>
          ) : (
            <span className="text-text-muted">{t("detail.customerHidden")}</span>
          )}
        </Item>
        <Item label={t("detail.source")}>{t(`sources.${ret.source}`)}</Item>
        <Item label={t("detail.requestedAt")}>{moment(ret.created_at)}</Item>
        <Item label={t("detail.documentDate")}>{day(ret.document_date)}</Item>
        {ret.reviewed_at ? <Item label={t("detail.reviewedAt")}>{moment(ret.reviewed_at)}</Item> : null}
        {ret.reason ? <Item label={t("detail.reason")}>{ret.reason}</Item> : null}
      </Card>

      <Steps ret={ret} />

      {action === "approve" ? <ApprovePanel ret={ret} permissions={permissions} deliveryFee={deliveryFee} onPosted={() => posted("approve")} /> : null}
      {action === "receive" ? <ReceivePanel ret={ret} onPosted={() => posted("receive")} /> : null}
      {action === "inspect" ? <InspectPanel ret={ret} locations={locations} onPosted={() => posted("inspect")} /> : null}
      {action === "refund" ? <RefundPanel ret={ret} cashAccounts={cashAccounts} collection={collection} onPosted={() => posted("refund")} /> : null}
      {pending && !action ? (
        <Alert tone="info" data-testid="return-waiting" data-step={pending}>
          {t("detail.waiting", { step: t(`steps.${pending}`), permission: ACTION_PERMISSION[pending] })}
        </Alert>
      ) : null}

      <Card className="overflow-x-auto">
        <h2 className="mb-2 font-bold">{t("detail.lines")}</h2>
        <table className="w-full text-sm" data-testid="return-lines">
          <thead className="text-text-muted">
            <tr>
              <th className="px-3 py-2 text-start font-semibold">{t("detail.product")}</th>
              <th className="px-3 py-2 text-start font-semibold">{t("detail.reasonCode")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("detail.requested")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("detail.approved")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("detail.unitPrice")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("detail.discountShare")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("detail.netPaid")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("detail.lineRefund")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("detail.points")}</th>
              {inspected ? <th className="px-3 py-2 text-start font-semibold">{t("detail.inspection")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {ret.items.map((item) => (
              <tr key={item.id} className="border-t border-border align-top" data-testid="return-line" data-item={item.id}>
                <td className="px-3 py-2">
                  <span className="font-medium">{name(item)}</span>
                  <span className="block text-xs text-text-muted">{item.customer_reason}</span>
                </td>
                <td className="px-3 py-2">{t(`reasonCodes.${item.reason_code}`)}</td>
                <td className="px-3 py-2 text-end" dir="ltr" data-testid="return-line-requested">
                  {quantityText(item.quantity, item)}
                </td>
                <td className="px-3 py-2 text-end" dir="ltr" data-testid="return-line-approved">
                  {reviewed ? quantityText(item.approved_quantity, item) : "—"}
                </td>
                <td className="px-3 py-2 text-end" dir="ltr">
                  {money(item.unit_price)}
                </td>
                <td className="px-3 py-2 text-end" dir="ltr">
                  {money(item.discount_share)}
                </td>
                <td className="px-3 py-2 text-end" dir="ltr" data-testid="return-line-net">
                  {money(item.net_amount)}
                </td>
                <td className="px-3 py-2 text-end font-semibold" dir="ltr" data-testid="return-line-refund">
                  {reviewed ? money(item.approved_refund) : "—"}
                </td>
                <td className="px-3 py-2 text-end text-xs" data-testid="return-line-points">
                  {t("detail.pointsShare", { earned: item.earned_points_share, redeemed: item.redeemed_points_share })}
                </td>
                {inspected ? (
                  <td className="px-3 py-2" data-testid="return-line-inspection">
                    {item.condition ? t(`conditions.${item.condition}`) : "—"}
                    {item.inspection_location ? (
                      <span className="block text-xs text-text-muted" dir="ltr">
                        {item.inspection_location.code}
                      </span>
                    ) : null}
                    {item.condition ? <span className="block text-xs text-text-muted">{item.restock ? t("detail.restocked") : t("detail.writtenDown")}</span> : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-text-muted">{t("detail.netPaidHint")}</p>
      </Card>

      <Card className="flex flex-col gap-4 text-sm" data-testid="return-money">
        <h2 className="font-bold">{t("detail.money")}</h2>
        <dl className="grid gap-3 md:grid-cols-3">
          <Amount label={t("detail.expectedRefund")} value={money(ret.expected_refund)} testId="return-expected" />
          <Amount label={t("detail.deliveryFeeRefund")} value={money(ret.delivery_fee_refund)} testId="return-fee-refund" />
          {deliveryFee !== null ? <Amount label={t("detail.deliveryFeeCharged")} value={money(deliveryFee)} testId="return-fee-charged" /> : null}
          {inspected ? (
            <>
              <Amount label={t("detail.refundAmount")} value={money(ret.refund_amount)} testId="return-refund-amount" />
              <Amount label={t("detail.uncollectedOffset")} value={money(ret.uncollected_offset)} testId="return-offset" />
              <Amount label={t("detail.cashRefund")} value={money(ret.cash_refund_amount)} testId="return-cash-refund" strong />
            </>
          ) : null}
        </dl>
        <p className="text-xs text-text-muted" data-testid="return-fee-policy">
          {reviewed ? (ret.delivery_fee_refund > 0 ? t("detail.feePolicyRefunded") : t("detail.feePolicyNone")) : t("detail.feePolicy")}
        </p>
        <div className="border-t border-border pt-3" data-testid="return-points">
          <p className="font-semibold">{t("detail.pointsEffect")}</p>
          <p className="mt-1">
            {t("detail.pointsEffectBody", {
              reversed: ret.points_effect.earned_reversed,
              restored: ret.points_effect.redeemed_restored,
              net: ret.points_effect.net,
            })}
          </p>
          <p className="mt-1 text-xs text-text-muted">{settled ? t("detail.pointsApplied") : t("detail.pointsPending")}</p>
        </div>
        {ret.refund_payments.length ? (
          <div className="border-t border-border pt-3" data-testid="return-payments">
            <p className="font-semibold">{t("detail.payments")}</p>
            <ul className="mt-1 flex flex-col gap-1">
              {ret.refund_payments.map((payment) => (
                <li key={payment.id} data-testid="return-payment" data-method={payment.method}>
                  <span dir="ltr" className="font-semibold">
                    {money(payment.amount_iqd)}
                  </span>{" "}
                  {payment.method === "cash_account"
                    ? t("detail.paidFromCash", { account: payment.cash_account?.name ?? "—" })
                    : t("detail.paidFromCustody", { proof: payment.proof_reference ?? "—" })}{" "}
                  <span className="text-text-muted">{day(payment.document_date)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {canViewLedger && ret.postings.length ? (
          <div className="flex flex-wrap gap-3 border-t border-border pt-3" data-testid="return-postings">
            <span className="font-semibold">{t("detail.postings")}</span>
            {ret.postings.map((posting) => (
              <Link key={posting.journal_entry_id} href={entryHref(posting.journal_entry_id)} className="text-primary-dark hover:underline" data-role={posting.role}>
                {t(`postingRoles.${posting.role}`)} <span dir="ltr">({posting.journal_document_number})</span>
              </Link>
            ))}
          </div>
        ) : null}
      </Card>

      <Card className="text-sm" data-testid="return-timeline">
        <h2 className="mb-3 font-bold">{t("detail.timeline")}</h2>
        <ol className="flex flex-col gap-3 border-s border-border ps-4">
          {ret.events.map((event) => (
            <li key={event.id} data-testid="return-event" data-type={event.type}>
              <p className="font-semibold">{t(`events.${event.type}`)}</p>
              <p className="text-xs text-text-muted">
                {moment(event.created_at)} · {t(`actors.${eventActor(event, ret)}`)}
                {event.document_date ? ` · ${t("detail.documentDate")}: ${day(event.document_date)}` : ""}
              </p>
              {event.note ? <p className="mt-1">{event.note}</p> : null}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function Steps({ ret }: { ret: Return }) {
  const t = useTranslations("returns");
  const icons = { done: Check, current: CircleDot, upcoming: Circle, skipped: Minus } as const;
  return (
    <ol className="grid gap-2 sm:grid-cols-4" data-testid="return-steps">
      {stepStates(ret.status).map(({ action, state }) => {
        const Icon = icons[state];
        return (
          <li
            key={action}
            data-testid={`return-step-${action}`}
            data-state={state}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
              state === "done" && "border-success/40 bg-success/10",
              state === "current" && "border-primary bg-primary/10 font-semibold",
              state === "upcoming" && "border-border text-text-muted",
              state === "skipped" && "border-border text-text-muted line-through",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span>{ret.status === "rejected" && action === "approve" ? t("statuses.rejected") : t(`steps.${action}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-text-muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function Amount({ label, value, testId, strong }: { label: string; value: string; testId: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd dir="ltr" className={cn("text-start", strong && "text-base font-bold")} data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
