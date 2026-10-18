"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui";
import { expenseRefusal } from "@/lib/expenses";

/** One of the expense routes' declared refusals, in words (Arabic or English). */
export function ExpenseRefusalNotice({ error }: { error: unknown }) {
  const t = useTranslations("expenses.refusals");
  const code = expenseRefusal(error);
  if (!code) return null;
  return (
    <Alert data-testid="expense-refusal" data-code={code}>
      {t(code)}
    </Alert>
  );
}
