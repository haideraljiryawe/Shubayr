"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Alert, Badge, Button, Card, Textarea } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { ExceptionPostingStatus } from "@/components/finance/exception-status";
import { usePosting } from "@/components/finance/use-posting";
import { browserApi, unwrap } from "@/lib/api/client";
import { OperationKey } from "@/lib/finance/cash-receipts";
import type { CustodyException } from "@/lib/finance/custody-exceptions";
import { entryHref } from "@/lib/finance/links";
import { moneyText, toFixed } from "@/lib/purchasing";

export function ExceptionView({ exception, canReverse, canViewLedger }: { exception: CustodyException; canReverse: boolean; canViewLedger: boolean }) {
  const t = useTranslations("custodyExceptions");
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const [reversedNumber, setReversedNumber] = useState<string | null>(null);
  const money = (value: number) => moneyText(toFixed(value), "IQD", 0, locale);
  const day = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium", numberingSystem: "latn", timeZone: "UTC" });
  const partyLoss = exception.type === "goods_loss" && exception.liability_bearer === "party";

  return (
    <div className="flex flex-col gap-6" data-testid="exception-view" data-status={exception.status} data-type={exception.type}>
      {reversedNumber ? (
        <Alert tone="success" data-testid="exception-notice">
          {t("detail.reversedNotice", { number: reversedNumber })}
        </Alert>
      ) : null}
      <Card className="grid gap-4 text-sm md:grid-cols-4">
        <Item label={t("detail.type")}>
          <span data-testid="exception-type">{t(`types.${exception.type}`)}</span>
        </Item>
        <Item label={t("detail.status")}>
          <Badge tone={exception.status === "active" ? "success" : "neutral"} data-testid="exception-status" data-status={exception.status}>
            {t(`statuses.${exception.status}`)}
          </Badge>
        </Item>
        <Item label={t("detail.order")}>
          <Link href={`/orders/${exception.order_id}`} className="font-semibold text-primary-dark hover:underline" dir="ltr" data-testid="exception-order">
            {exception.order.order_number}
          </Link>
        </Item>
        <Item label={t("detail.party")}>
          <Link href={`/delivery-parties/${exception.party_id}`} className="font-semibold text-primary-dark hover:underline" data-testid="exception-party">
            {exception.party.name}
          </Link>
        </Item>
        <Item label={t("detail.amount")}>
          <span className="font-bold" dir="ltr" data-testid="exception-amount">
            {money(exception.amount_iqd)}
          </span>
        </Item>
        {exception.liability_bearer ? (
          <Item label={t("detail.bearer")}>
            <span data-testid="exception-bearer" data-bearer={exception.liability_bearer}>
              {t(`bearers.${exception.liability_bearer}`)}
            </span>
          </Item>
        ) : null}
        {exception.type !== "goods_loss" ? (
          <>
            <Item label={t("detail.offset")}>
              <span dir="ltr" data-testid="exception-offset">
                {money(exception.exception_offset_iqd)}
              </span>
            </Item>
            <Item label={t("detail.refundPayable")}>
              <span dir="ltr">{money(exception.refund_payable_iqd)}</span>
            </Item>
          </>
        ) : null}
        {exception.goods_cost_iqd !== undefined ? (
          <Item label={t("detail.goodsCost")}>
            <span dir="ltr">{money(exception.goods_cost_iqd)}</span>
          </Item>
        ) : null}
        {exception.cash_account ? <Item label={t("detail.cashAccount")}>{exception.cash_account.name}</Item> : null}
        <Item label={t("detail.documentDate")}>{day(exception.document_date)}</Item>
        <Item label={t("detail.reason")}>{exception.reason}</Item>
      </Card>

      {exception.lines.length ? (
        <Card className="overflow-x-auto">
          <h2 className="mb-2 font-bold">{t("detail.lines")}</h2>
          <table className="w-full text-sm">
            <thead className="text-text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">{t("create.product")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("create.lot")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("detail.quantity")}</th>
                {exception.type === "return_against_uncollected" ? <th className="px-3 py-2 text-end font-semibold">{t("detail.returnAmount")}</th> : null}
                {exception.lines[0]?.location ? <th className="px-3 py-2 text-start font-semibold">{t("create.location")}</th> : null}
              </tr>
            </thead>
            <tbody>
              {exception.lines.map((line) => (
                <tr key={line.id} className="border-t border-border" data-testid="exception-line">
                  <td className="px-3 py-2">{locale === "ar" ? line.order_item.product_name_ar : line.order_item.product_name_en}</td>
                  <td className="px-3 py-2" dir="ltr">
                    {line.batch.lot_number ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-end" dir="ltr">
                    {line.quantity}
                  </td>
                  {exception.type === "return_against_uncollected" ? (
                    <td className="px-3 py-2 text-end" dir="ltr">
                      {money(line.return_amount_iqd)}
                    </td>
                  ) : null}
                  {line.location ? (
                    <td className="px-3 py-2" dir="ltr">
                      {line.location.code}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {canViewLedger && exception.postings.length ? (
        <Card className="flex flex-wrap gap-3 text-sm">
          <span className="font-semibold">{t("detail.postings")}</span>
          {exception.postings.map((posting) => (
            <Link key={posting.journal_entry_id} href={entryHref(posting.journal_entry_id)} className="text-primary-dark hover:underline">
              {posting.event}
            </Link>
          ))}
        </Card>
      ) : null}

      {exception.reversal ? (
        <Alert tone="info" data-testid="exception-reversal">
          <p className="font-semibold">{t("detail.reversedBy", { number: exception.reversal.document_number, date: day(exception.reversal.document_date) })}</p>
          <p data-testid="exception-reversal-reason">{exception.reversal.reason}</p>
        </Alert>
      ) : null}

      {canReverse ? (
        <ReversePanel
          exception={exception}
          partyLoss={partyLoss}
          onPosted={(number) => {
            setReversedNumber(number);
            router.refresh();
          }}
        />
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

/**
 * Reverse with a reason. The API refuses the person who recorded it
 * (separation of duties), and a party-borne loss once a cash receipt has
 * taken that liability in — that receipt is reversed first. Both are said
 * here, the latter before anyone tries.
 */
function ReversePanel({ exception, partyLoss, onPosted }: { exception: CustodyException; partyLoss: boolean; onPosted: (number: string) => void }) {
  const t = useTranslations("custodyExceptions.detail");
  const posting = usePosting<CustodyException>();
  const operation = useRef(new OperationKey());
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(null);
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";
  const tooShort = reason.trim().length < 3;

  async function reverse() {
    setAttempted(true);
    if (tooShort) return;
    const id = operation.current.id(reason.trim());
    setOperationId(id);
    const settled = await posting.post(id, () =>
      unwrap(browserApi.POST("/admin/custody-exceptions/{id}/reversal", { params: { path: { id: exception.id } }, body: { operation_id: id, reason: reason.trim() } })),
    );
    if (settled?.phase === "posted") onPosted(settled.document.reversal?.document_number ?? settled.document.document_number);
  }

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-2">
        {partyLoss ? <p className="text-xs text-text-muted" data-testid="exception-receipt-rule">{t("receiptRule")}</p> : null}
        <Button variant="danger" onClick={() => setOpen(true)} data-testid="exception-reverse">
          {t("reverse")}
        </Button>
      </div>
    );
  }
  return (
    <Card className="flex flex-col gap-3 border-error/40" data-testid="exception-reverse-panel">
      <h2 className="text-lg font-bold">{t("reverseTitle")}</h2>
      <p className="text-sm text-text-muted">{t("reverseBody")}</p>
      {partyLoss ? (
        <Alert tone="info" data-testid="exception-receipt-rule">
          {t("receiptRule")}
        </Alert>
      ) : null}
      <Field label={t("reverseReason")} name="reason" error={attempted && tooShort ? t("reverseReasonRequired") : null}>
        <Textarea value={reason} maxLength={500} rows={2} disabled={busy} onChange={(event) => setReason(event.target.value)} data-testid="exception-reverse-reason" />
      </Field>
      {operationId ? (
        <ExceptionPostingStatus state={posting.state} partyId={exception.party_id} onRetry={() => void reverse()} onCheck={() => void posting.check(operationId)} />
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
        <Button variant="danger" pending={busy} onClick={() => void reverse()} data-testid="exception-reverse-confirm">
          {t("reverseConfirm")}
        </Button>
      </div>
    </Card>
  );
}
