"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Card, Select, Textarea } from "@/components/ui";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { usePosting } from "@/components/finance/use-posting";
import { PartySearch, type PartyChoice } from "@/components/parties/party-search";
import { DocumentDateFields, documentDateError, type DocumentDateValue } from "@/components/purchasing/document-date";
import { TripRefusal } from "@/components/trips/trip-refusal";
import { browserApi, unwrap } from "@/lib/api/client";
import { errorKind } from "@/lib/api/errors";
import type { CashAccountOption } from "@/lib/api/purchasing-server";
import { OperationKey } from "@/lib/finance/cash-receipts";
import { FARE_METHODS, tripHref, tripRefusal, type FareBearer, type FareMethod, type Trip } from "@/lib/trips";

/**
 * A trip: the driver (searched), who pays the fare — the store, or the
 * customer directly — its amount and how the store settles it, and an
 * agreement for failed or cancelled deliveries. Posted once per request.
 */
export function TripForm({
  driver: initialDriver,
  cashAccounts,
  canBackdate,
  today,
  windowDays,
}: {
  driver: PartyChoice | null;
  cashAccounts: CashAccountOption[];
  canBackdate: boolean;
  today: string;
  windowDays: number;
}) {
  const t = useTranslations("trips.create");
  const tt = useTranslations("trips");
  const router = useRouter();
  const posting = usePosting<Trip>();
  const operation = useRef(new OperationKey());
  const [driver, setDriver] = useState<PartyChoice | null>(initialDriver);
  const [bearer, setBearer] = useState<FareBearer>("store");
  const [method, setMethod] = useState<FareMethod>("payable");
  const [fare, setFare] = useState("");
  const [accountId, setAccountId] = useState("");
  const [agreement, setAgreement] = useState("");
  const [date, setDate] = useState<DocumentDateValue>({ date: today, backdateReason: "" });
  const [attempted, setAttempted] = useState(false);
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";

  const problems = [
    ...(driver ? [] : [t("errors.driver")]),
    ...(/^\d+$/.test(fare.trim()) ? [] : [t("errors.fare")]),
    ...(method === "cash_account" && !accountId ? [t("errors.cash")] : []),
    ...(documentDateError(date, today, windowDays, canBackdate) ? [t("errors.date")] : []),
  ];

  async function submit() {
    setAttempted(true);
    if (problems.length || !driver) return;
    const payload = {
      driver_party_id: driver.id,
      fare_bearer: bearer,
      fare_amount_iqd: fare.trim(),
      fare_settlement_method: method,
      ...(method === "cash_account" ? { fare_cash_account_id: accountId } : {}),
      ...(agreement.trim() ? { failure_cancellation_agreement: agreement.trim() } : {}),
      document_date: date.date,
      ...(date.backdateReason.trim() ? { backdate_reason: date.backdateReason.trim() } : {}),
    };
    const id = operation.current.id(JSON.stringify(payload));
    const settled = await posting.post(id, () => unwrap(browserApi.POST("/admin/external-driver-trips", { body: { operation_id: id, ...payload } })));
    if (settled?.phase === "posted") router.push(tripHref(settled.document.id));
  }

  return (
    <Card className="flex flex-col gap-4" data-testid="trip-form">
      <div className="grid gap-4 md:grid-cols-3">
        <PartySearch value={driver} onChange={setDriver} kind="external_driver" activeOnly label={t("driver")} testId="trip-driver" disabled={busy} />
        <fieldset className="flex flex-col gap-2 text-sm" disabled={busy}>
          <legend className="mb-1 font-semibold">{t("bearer")}</legend>
          {(["store", "customer_direct"] as const).map((value) => (
            <label key={value} className="flex items-start gap-2">
              <input
                type="radio"
                name="bearer"
                className="mt-1"
                checked={bearer === value}
                onChange={() => {
                  setBearer(value);
                  setMethod(FARE_METHODS[value][0]);
                }}
                data-testid={`trip-bearer-${value}`}
              />
              <span className="flex flex-col">
                <span>{tt(`bearers.${value}`)}</span>
                <span className="text-xs text-text-muted">{t(`bearerHints.${value}`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Field label={t("fare")} name="fare_amount_iqd">
          <DecimalInput value="" parse={{ maxDecimals: 0 }} disabled={busy} onValueChange={(_, text) => setFare(text.trim())} data-testid="trip-fare" />
        </Field>
        <Field label={t("method")} name="fare_settlement_method" hint={t(`methodHints.${method}`)}>
          <Select value={method} disabled={busy || bearer === "customer_direct"} onChange={(event) => setMethod(event.target.value as FareMethod)} data-testid="trip-method">
            {FARE_METHODS[bearer].map((value) => (
              <option key={value} value={value}>
                {tt(`methods.${value}`)}
              </option>
            ))}
          </Select>
        </Field>
        {method === "cash_account" ? (
          <Field label={t("cashAccount")} name="fare_cash_account_id">
            <Select value={accountId} disabled={busy} onChange={(event) => setAccountId(event.target.value)} data-testid="trip-cash-account">
              <option value="">{t("pickCash")}</option>
              {cashAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <DocumentDateFields value={date} onChange={setDate} today={today} windowDays={windowDays} canBackdate={canBackdate} showErrors={attempted} disabled={busy} testId="trip" />
        <Field label={t("agreement")} name="failure_cancellation_agreement" hint={t("agreementHint")}>
          <Textarea value={agreement} maxLength={500} rows={2} disabled={busy} onChange={(event) => setAgreement(event.target.value)} />
        </Field>
      </div>
      {attempted && problems.length ? (
        <ul className="list-inside list-disc rounded-md bg-error/5 p-3 text-sm font-semibold text-error-dark" role="alert" data-testid="trip-problems">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      {posting.state.phase === "error" ? (
        tripRefusal(posting.state.error) ? <TripRefusal error={posting.state.error} /> : <FormError kind={errorKind(posting.state.error)} detail={posting.state.error.message} />
      ) : null}
      <div className="flex justify-end">
        <Button pending={busy} onClick={() => void submit()} data-testid="trip-submit">
          {t("submit")}
        </Button>
      </div>
    </Card>
  );
}
