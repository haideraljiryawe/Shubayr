"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Info, Pencil, Plus, Power, Trash2, TriangleAlert } from "lucide-react";
import { Alert, Badge, Button, Card } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { FormError } from "@/components/forms/form-error";
import { NumberInput } from "@/components/forms/number-input";
import { useApiForm } from "@/components/forms/use-api-form";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError, errorKind, type ErrorKind, errorCode } from "@/lib/api/errors";
import { sortTiers, tierDiscount, tierWarnings, type DiscountTier } from "@/lib/delivery-pricing";
import { formatAmount } from "@/lib/finance/money";
import { useLocaleScopedState } from "@/components/forms/use-locale-scoped-state";

type Dialog = { kind: "form"; tier: DiscountTier | null } | { kind: "delete"; tier: DiscountTier } | null;

/**
 * Automatic discounts: from a goods subtotal up, a percentage off. The
 * highest active tier an order reaches applies, never to the delivery fee;
 * each row spells out what that means for an order at its threshold.
 */
export function TiersView({ tiers, stacking }: { tiers: DiscountTier[]; stacking: boolean }) {
  const t = useTranslations("discountTiers");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; kind: ErrorKind; errorCode: string | null } | null>(null);
  const money = (value: number) => formatAmount(value, "IQD", 0, locale);
  const percent = (value: number) => value.toLocaleString(locale === "ar" ? "ar-IQ" : "en-US", { maximumFractionDigits: 2, numberingSystem: "latn" });
  const warnings = tierWarnings(tiers);
  const close = () => setDialog(null);

  async function toggle(tier: DiscountTier) {
    setToggling(tier.id);
    setRowError(null);
    try {
      await unwrap(
        browserApi.PATCH("/admin/discount-tiers/{id}", { params: { path: { id: tier.id } }, body: { is_active: !tier.is_active } }),
      );
      router.refresh();
    } catch (cause) {
      setRowError({ id: tier.id, kind: errorKind(cause), errorCode: errorCode(cause) ?? null });
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Alert tone="info" data-testid="tiers-stacking-note">
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{stacking ? t("stackingOn") : t("stackingOff")}</span>
        </p>
        <p className="mt-1 text-caption">{t("noDeliveryFee")}</p>
      </Alert>

      <div className="flex justify-end">
        <Button onClick={() => setDialog({ kind: "form", tier: null })} data-testid="tier-new">
          <Plus className="size-4" aria-hidden />
          {t("new")}
        </Button>
      </div>

      {tiers.length === 0 ? (
        <Card className="text-body text-text-muted" data-testid="tiers-empty">
          {t("empty")}
        </Card>
      ) : (
        <ol className="flex flex-col gap-3">
          {sortTiers(tiers).map((tier) => {
            const minimum = Number(tier.min_subtotal);
            return (
              <li key={tier.id}>
                <Card className="flex flex-wrap items-center gap-4" data-testid="tier-row" data-min={minimum} data-percent={tier.percent}>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="font-bold">
                      {t("rowTitle", { minimum: money(minimum), percent: percent(tier.percent) })}
                      <Badge tone={tier.is_active ? "success" : "neutral"} className="ms-2" data-testid="tier-status">
                        {tier.is_active ? t("active") : t("inactive")}
                      </Badge>
                    </p>
                    <p className="text-body text-text-muted" data-testid="tier-example">
                      {t("example", {
                        subtotal: money(minimum),
                        percent: percent(tier.percent),
                        discount: money(tierDiscount(minimum, tier.percent)),
                      })}
                    </p>
                    {warnings.has(tier.id) ? (
                      <p className="flex items-center gap-1 text-caption text-warning-dark" data-testid="tier-warning">
                        <TriangleAlert className="size-3.5" aria-hidden />
                        {t("notBetter")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "form", tier })} data-testid="tier-edit">
                      <Pencil className="size-4" aria-hidden />
                      {t("edit")}
                    </Button>
                    <Button size="sm" variant="ghost" pending={toggling === tier.id} onClick={() => void toggle(tier)} data-testid="tier-toggle">
                      <Power className="size-4" aria-hidden />
                      {tier.is_active ? t("deactivate") : t("activate")}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-error-dark" onClick={() => setDialog({ kind: "delete", tier })} data-testid="tier-delete">
                      <Trash2 className="size-4" aria-hidden />
                      {t("delete")}
                    </Button>
                  </div>
                  {rowError?.id === tier.id ? <FormError kind={rowError.kind} code={rowError.errorCode} /> : null}
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      {dialog?.kind === "form" ? (
        <TierForm
          key={dialog.tier?.id ?? "new"}
          tier={dialog.tier}
          onClose={close}
          onSaved={(created) => {
            toast(created ? t("created") : t("saved"));
            close();
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title={t("deleteTitle")}
        body={t("deleteBody")}
        confirmLabel={t("delete")}
        requireReason={false}
        onClose={close}
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          await unwrap(browserApi.DELETE("/admin/discount-tiers/{id}", { params: { path: { id: dialog.tier.id } } }));
          toast(t("deleted"));
          router.refresh();
        }}
      />
    </div>
  );
}

/** Create or edit a tier, with what it does for an order shown as it is typed. */
function TierForm({ tier, onClose, onSaved }: { tier: DiscountTier | null; onClose: () => void; onSaved: (created: boolean) => void }) {
  const t = useTranslations("discountTiers");
  const locale = useLocale();
  const api = useApiForm();
  const [minimum, setMinimum] = useState<number | null>(tier ? Number(tier.min_subtotal) : null);
  const [percent, setPercent] = useState<number | null>(tier ? tier.percent : null);
  const [active, setActive] = useState(tier?.is_active ?? true);
  const [errors, setErrors] = useLocaleScopedState<Record<string, string>>({});
  const money = (value: number) => formatAmount(value, "IQD", 0, locale);
  const shownPercent = (value: number) => value.toLocaleString(locale === "ar" ? "ar-IQ" : "en-US", { maximumFractionDigits: 2, numberingSystem: "latn" });
  const valid = minimum !== null && minimum >= 0 && percent !== null && percent > 0 && percent <= 50;

  async function submit() {
    const found: Record<string, string> = {};
    if (minimum === null || minimum < 0 || !Number.isInteger(minimum)) found.min_subtotal_iqd = t("errors.minimum");
    if (percent === null || !(percent > 0) || percent > 50) found.percent = t("errors.percent");
    setErrors(found);
    if (Object.keys(found).length) return;
    const body = { min_subtotal_iqd: minimum ?? 0, percent: percent ?? 0, is_active: active };
    const saved = await api.run(async () => {
      try {
        return tier
          ? await unwrap(browserApi.PATCH("/admin/discount-tiers/{id}", { params: { path: { id: tier.id } }, body }))
          : await unwrap(browserApi.POST("/admin/discount-tiers", { body }));
      } catch (cause) {
        // One tier per threshold: said next to the threshold, in words.
        if (cause instanceof ApiError && cause.code === "DISCOUNT_TIER_THRESHOLD_EXISTS") {
          setErrors({ min_subtotal_iqd: t("errors.thresholdTaken") });
        }
        throw cause;
      }
    });
    if (saved) onSaved(!tier);
  }

  return (
    <FormDialog
      open
      title={tier ? t("editTitle") : t("newTitle")}
      submitLabel={tier ? t("save") : t("create")}
      pending={api.pending}
      onSubmit={() => void submit()}
      onClose={onClose}
      testId="tier-form"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("fields.minimum")} name="min_subtotal_iqd" error={errors.min_subtotal_iqd ?? api.fieldErrors.min_subtotal_iqd} hint={t("fields.minimumHint")}>
          <NumberInput grouping value={minimum} parse={{ integer: true, min: 0 }} onValueChange={setMinimum} data-testid="tier-minimum" />
        </Field>
        <Field label={t("fields.percent")} name="percent" error={errors.percent ?? api.fieldErrors.percent} hint={t("fields.percentHint")}>
          <NumberInput value={percent} parse={{ maxDecimals: 2, min: 0 }} onValueChange={setPercent} data-testid="tier-percent" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-label">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} data-testid="tier-active" />
        {t("fields.active")}
      </label>
      <div className="rounded-md bg-card px-4 py-3 text-body" aria-live="polite" data-testid="tier-form-example">
        {valid
          ? t("example", { subtotal: money(minimum), percent: shownPercent(percent), discount: money(tierDiscount(minimum, percent)) })
          : t("exampleEmpty")}
      </div>
      <FormError kind={api.formError} code={api.formErrorCode} />
    </FormDialog>
  );
}
