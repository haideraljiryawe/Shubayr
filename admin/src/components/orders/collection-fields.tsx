"use client";

import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui";
import { DecimalInput } from "@/components/forms/decimal-input";
import { previewCollection, type CollectionChoice, type DeliveryCollection } from "@/lib/collection";
import { formatMoney } from "@/lib/orders";

/**
 * What was collected for a COD delivery: the amount (pre-filled with what is
 * due, editable) or — when the caller allows it — "not confirmed yet". A
 * shortfall, or an amount above what is due, is said before confirming.
 */
export function CollectionFields({
  due,
  currency,
  choice,
  onChoice,
  amount,
  onAmount,
  allowUnconfirmed,
}: {
  due: number;
  currency: string;
  choice: CollectionChoice;
  onChoice: (choice: CollectionChoice) => void;
  /** The parsed amount; null while the text is not a number. */
  amount: string | null;
  onAmount: (amount: string | null) => void;
  allowUnconfirmed: boolean;
}) {
  const t = useTranslations("collections");
  const locale = useLocale();
  const money = (value: number) => formatMoney(value, currency, locale);
  const preview = previewCollection(due, choice, amount);

  return (
    <fieldset className="mt-3 flex flex-col gap-3 text-sm" data-testid="collection-fields">
      <legend className="font-semibold">{t("fields.title")}</legend>
      <p>
        {t("fields.due")}:{" "}
        <span className="font-bold" dir="ltr" data-testid="collection-due">
          {money(due)}
        </span>
      </p>
      <label className="flex items-start gap-2">
        <input
          type="radio"
          name="collection-choice"
          className="mt-1"
          checked={choice === "confirmed"}
          onChange={() => onChoice("confirmed")}
          data-testid="collection-confirmed"
        />
        <span className="flex flex-1 flex-col gap-1">
          <span>{t("fields.collected")}</span>
          {choice === "confirmed" ? (
            <span className="flex items-center gap-2">
              <span className="w-40">
                <DecimalInput
                  value={String(due)}
                  onValueChange={(value) => onAmount(value)}
                  parse={{ required: true, maxDecimals: 6 }}
                  aria-label={t("fields.amount")}
                  data-testid="collection-amount"
                />
              </span>
              <span className="text-text-muted">{currency}</span>
            </span>
          ) : null}
        </span>
      </label>
      {allowUnconfirmed ? (
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="collection-choice"
            className="mt-1"
            checked={choice === "unconfirmed"}
            onChange={() => onChoice("unconfirmed")}
            data-testid="collection-unconfirmed"
          />
          <span className="flex flex-col">
            <span>{t("fields.notConfirmed")}</span>
            <span className="text-xs text-text-muted">{t("fields.notConfirmedHint")}</span>
          </span>
        </label>
      ) : null}
      <p
        className={
          preview.state === "short" || preview.state === "over"
            ? "rounded-md bg-error/5 p-2 font-semibold text-error-dark"
            : "rounded-md bg-card p-2"
        }
        role="status"
        data-testid="collection-preview"
        data-state={preview.state}
      >
        {preview.state === "short"
          ? t("preview.short", { shortfall: money(preview.shortfall) })
          : t(`preview.${preview.state}`)}
      </p>
    </fieldset>
  );
}

const TONES = { confirmed_full: "success", confirmed_short: "danger", unconfirmed: "warning" } as const;

/** A recorded collection: in full, short (by how much), or not yet confirmed. */
export function CollectionSummary({ collection, testId = "collection-summary" }: { collection: DeliveryCollection; testId?: string }) {
  const t = useTranslations("collections");
  const locale = useLocale();
  const money = (value: number | null) => (value === null ? "—" : formatMoney(value, collection.currency, locale));
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid={testId} data-status={collection.status}>
      <Badge tone={TONES[collection.status]} data-testid="collection-status">
        {t(`status.${collection.status}`)}
      </Badge>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
        <dt className="text-text-muted">{t("fields.due")}</dt>
        <dd dir="ltr" className="text-end">
          {money(collection.due_amount)}
        </dd>
        <dt className="text-text-muted">{t("summary.collected")}</dt>
        <dd dir="ltr" className="text-end" data-testid="collection-collected">
          {money(collection.collected_amount)}
        </dd>
        {collection.status === "confirmed_short" ? (
          <>
            <dt className="text-text-muted">{t("summary.shortfall")}</dt>
            <dd dir="ltr" className="text-end font-bold text-error-dark" data-testid="collection-shortfall">
              {money(collection.shortfall_amount)}
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}
