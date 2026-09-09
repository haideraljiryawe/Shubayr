"use client";

import { useTranslations } from "next-intl";
import { Banknote } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Radio } from "@/components/ui/radio";

/**
 * Cash on delivery is the only method the contract accepts
 * (`payment_method: [cod]`), so it renders selected and read-only rather than
 * as a fake choice. The list shape is deliberate: adding a gateway later means
 * adding a row, not rebuilding the step.
 */
export function PaymentMethod() {
  const t = useTranslations("checkout");

  return (
    <Card padding="md" className="flex flex-col gap-3">
      <h2 className="text-base font-bold text-text">{t("payment")}</h2>

      <div className="flex items-start gap-3 rounded-md border border-primary bg-primary/8 px-4 py-3">
        <Radio
          name="payment_method"
          value="cod"
          checked
          readOnly
          aria-label={t("cod")}
          className="mt-0.5"
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-sm font-semibold text-text">
            <Banknote className="size-4 shrink-0 text-primary-dark" aria-hidden />
            {t("cod")}
          </span>
          <span className="text-xs text-text-muted">{t("codHint")}</span>
        </div>
      </div>

      <p className="text-xs text-text-muted">{t("moreMethodsSoon")}</p>
    </Card>
  );
}
