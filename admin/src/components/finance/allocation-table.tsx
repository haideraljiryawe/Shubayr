"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { DecimalInput } from "@/components/forms/decimal-input";
import { useStoreDateTime } from "@/components/orders/use-store-date";
import { ALLOCATION_DECIMALS, autoAllocate, type AllocationPlan, type Unsettled, type UnsettledRow } from "@/lib/finance/cash-receipts";
import { moneyText, toFixed } from "@/lib/purchasing";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/table/table";

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
        <p className="text-body text-text-muted" data-testid="allocation-none">
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
            <Table minWidth="40rem">
              <THead>
                <Tr>
                  <Th>{t("order")}</Th>
                  <Th>{t("collectedAt")}</Th>
                  <Th>{t("collected")}</Th>
                  <Th>{t("settled")}</Th>
                  <Th>{t("unsettled")}</Th>
                  <Th className="w-44">{t("allocate")}</Th>
                </Tr>
              </THead>
              <TBody>
                {suggestions.map((suggestion, index) => {
                  const row = rows[index];
                  return (
                    <Tr key={row.orderId} data-testid="allocation-row" data-order={row.orderNumber}>
                      <Td>
                        <Link href={`/orders/${row.orderId}`} className="font-semibold text-primary-dark hover:underline" dir="ltr">
                          {row.orderNumber}
                        </Link>
                      </Td>
                      <Td>{dateTime(suggestion.collected_at)}</Td>
                      <Td dir="ltr">{money(toFixed(suggestion.collected_amount_iqd))}</Td>
                      <Td dir="ltr">{money(toFixed(suggestion.allocated_amount_iqd))}</Td>
                      <Td className="font-semibold" dir="ltr" data-testid="allocation-unsettled">
                        {money(row.unsettled)}
                      </Td>
                      <Td>
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
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </div>
        </>
      )}
      <dl className="grid grid-cols-3 gap-3 text-body" data-testid="allocation-summary">
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
      <dt className="text-caption text-text-muted">{label}</dt>
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
    <ul className="list-inside list-disc rounded-md bg-error/5 p-3 text-label text-error-dark" role="alert" data-testid="allocation-problems">
      {plan.problems.map((problem, index) => (
        <li key={index} data-kind={problem.kind}>
          {"orderNumber" in problem ? t(problem.kind, { order: problem.orderNumber }) : t(problem.kind)}
        </li>
      ))}
    </ul>
  );
}
