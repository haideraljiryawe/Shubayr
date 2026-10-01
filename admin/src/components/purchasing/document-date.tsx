"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { documentDateProblem, type DateProblem } from "@/lib/purchasing";

export interface DocumentDateValue {
  date: string;
  backdateReason: string;
}

/** The document-date rule as one control pair: date plus, when needed, the back-dating reason. */
export function documentDateError(
  value: DocumentDateValue,
  today: string,
  windowDays: number,
  canBackdate: boolean,
): DateProblem {
  return documentDateProblem(value.date, today, { windowDays, canBackdate, reason: value.backdateReason });
}

/**
 * Document date and back-dating reason. No future dates; older than the
 * back-dating window only with backdate.approve and a reason — the rule the
 * server enforces, shown before anything is sent.
 */
export function DocumentDateFields({
  value,
  onChange,
  today,
  windowDays,
  canBackdate,
  showErrors,
  disabled = false,
  testId,
}: {
  value: DocumentDateValue;
  onChange: (value: DocumentDateValue) => void;
  today: string;
  windowDays: number;
  canBackdate: boolean;
  showErrors: boolean;
  disabled?: boolean;
  testId: string;
}) {
  const t = useTranslations("purchasing.date");
  const problem = documentDateError(value, today, windowDays, canBackdate);
  const old = /^\d{4}-\d{2}-\d{2}$/.test(value.date) && value.date < today;
  return (
    <>
      <Field
        label={t("documentDate")}
        name="document_date"
        error={showErrors && problem && problem !== "needsBackdateReason" ? t(`problem.${problem}`, { days: windowDays }) : null}
        hint={canBackdate ? t("hintBackdate", { days: windowDays }) : t("hint", { days: windowDays })}
      >
        <Input
          type="date"
          value={value.date}
          max={today}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, date: event.target.value })}
          data-testid={`${testId}-date`}
        />
      </Field>
      {old ? (
        <Field
          label={t("backdateReason")}
          name="backdate_reason"
          error={showErrors && problem === "needsBackdateReason" ? t("problem.needsBackdateReason") : null}
          hint={t("backdateReasonHint")}
        >
          <Input
            value={value.backdateReason}
            maxLength={500}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, backdateReason: event.target.value })}
            data-testid={`${testId}-backdate-reason`}
          />
        </Field>
      ) : null}
    </>
  );
}
