"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { DecimalInput } from "@/components/forms/decimal-input";
import { useStoreDateTime } from "@/components/orders/use-store-date";
import { ALLOCATION_DECIMALS, autoAllocate, type AllocationPlan, type Unsettled, type UnsettledRow } from "@/lib/finance/cash-receipts";
import { moneyText, toFixed } from "@/lib/purchasing";

/**
 * A party's unsettled collections, oldest first, with what to allocate to
 * each: typed per order, or filled oldest first from the amount by "auto".
 * The inputs are uncontrolled, so a fill remounts them (`generation`).
 */
export function AllocationTable({
  suggestions,
  rows,
  applied,
  generation,
  onApplied,
  plan,
  locked,
}: {
  suggestions: readonly Unsettled[];
  rows: readonly UnsettledRow[];
  applied: Readonly<Record<string, string>>;
  generation: number;
  /** The new amounts; `refill` when they replace what the inputs show. */
  onApplied: (next: Record<string, string>, refill: boolean) => void;
  plan: AllocationPlan;
  locked: boolean;
}) {
  const t = useTranslations("cashReceipts.allocation");
  const locale = useLocale();
  const dateTime = useStoreDateTime();
  const money = (value: bigint) => moneyText(value, "IQD", 0, locale);

  return (
    <div className="flex flex-col gap-3" data-testid="allocation-table">
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted" data-testid="allocation-none">
          {t("none")}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={locked || plan.amount <= 0n}
              onClick={() => onApplied(autoAllocate(plan.amount, rows), true)}
              data-testid="allocation-auto"
            >
              {t("auto")}
            </Button>
            <Button size="sm" variant="ghost" disabled={locked} onClick={() => onApplied({}, true)} data-testid="allocation-clear">
              {t("clear")}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-text-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-semibold">{t("order")}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t("collectedAt")}</th>
                  <th className="px-3 py-2 text-end font-semibold">{t("collected")}</th>
                  <th className="px-3 py-2 text-end font-semibold">{t("settled")}</th>
                  <th className="px-3 py-2 text-end font-semibold">{t("unsettled")}</th>
                  <th className="w-44 px-3 py-2 text-start font-semibold">{t("allocate")}</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((suggestion, index) => {
                  const row = rows[index];
                  return (
                    <tr key={row.orderId} className="border-t border-border" data-testid="allocation-row" data-order={row.orderNumber}>
                      <td className="px-3 py-2">
                        <Link href={`/orders/${row.orderId}`} className="font-semibold text-primary-dark hover:underline" dir="ltr">
                          {row.orderNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{dateTime(suggestion.collected_at)}</td>
                      <td className="px-3 py-2 text-end" dir="ltr">{money(toFixed(suggestion.collected_amount_iqd))}</td>
                      <td className="px-3 py-2 text-end" dir="ltr">{money(toFixed(suggestion.allocated_amount_iqd))}</td>
                      <td className="px-3 py-2 text-end font-semibold" dir="ltr" data-testid="allocation-unsettled">
                        {money(row.unsettled)}
                      </td>
                      <td className="px-3 py-2">
                        <DecimalInput
                          key={`${row.orderId}-${generation}`}
                          value={applied[row.orderId] ?? ""}
                          parse={{ maxDecimals: ALLOCATION_DECIMALS }}
                          className="h-9"
                          disabled={locked}
                          aria-label={t("allocateTo", { order: row.orderNumber })}
                          onValueChange={(_, text) => onApplied({ ...applied, [row.orderId]: text.trim() }, false)}
                          data-testid="allocation-amount"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <dl className="grid grid-cols-3 gap-3 text-sm" data-testid="allocation-summary">
        <Tile label={t("amount")} value={money(plan.amount)} testId="allocation-total" />
        <Tile label={t("allocated")} value={money(plan.allocated)} testId="allocation-allocated" />
        <Tile label={t("unallocated")} value={money(plan.unallocated)} testId="allocation-unallocated" />
      </dl>
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

/** The plan's problems, in words, before anything is sent. */
export function AllocationProblems({ plan, show }: { plan: AllocationPlan; show: boolean }) {
  const t = useTranslations("cashReceipts.problems");
  if (!show || plan.problems.length === 0) return null;
  return (
    <ul className="list-inside list-disc rounded-md bg-error/5 p-3 text-sm font-semibold text-error-dark" role="alert" data-testid="allocation-problems">
      {plan.problems.map((problem, index) => (
        <li key={index} data-kind={problem.kind}>
          {"orderNumber" in problem ? t(problem.kind, { order: problem.orderNumber }) : t(problem.kind)}
        </li>
      ))}
    </ul>
  );
}
