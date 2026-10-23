"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Pencil, Plus, Power, Search, Trash2, TriangleAlert } from "lucide-react";
import { Alert, Badge, Button, Card, Input } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { FormError } from "@/components/forms/form-error";
import { NumberInput } from "@/components/forms/number-input";
import { useApiForm } from "@/components/forms/use-api-form";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError, errorKind, type ErrorKind, errorCode } from "@/lib/api/errors";
import { englishOrArabic } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import {
  conflictsFromErrors,
  localName,
  sortZones,
  unservedGovernorates,
  type AdminGovernorate,
  type DeliveryZone,
  type ZoneConflict,
} from "@/lib/delivery-pricing";
import { formatAmount } from "@/lib/finance/money";

type Dialog = { kind: "form"; zone: DeliveryZone | null } | { kind: "delete"; zone: DeliveryZone } | null;

/**
 * Delivery zones: each a fee and the governorates it serves. A governorate
 * belongs to one zone at most; one with no zone (or in an inactive zone)
 * cannot be delivered to, and the warning at the top names them.
 */
export function ZonesView({ zones, governorates }: { zones: DeliveryZone[]; governorates: AdminGovernorate[] }) {
  const t = useTranslations("deliveryZones");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; kind: ErrorKind; errorCode: string | null } | null>(null);
  const unserved = unservedGovernorates(governorates);
  const money = (value: number) => formatAmount(value, "IQD", 0, locale);
  const close = () => setDialog(null);

  async function toggle(zone: DeliveryZone) {
    setToggling(zone.id);
    setRowError(null);
    try {
      await unwrap(
        browserApi.PATCH("/admin/delivery-zones/{id}", {
          params: { path: { id: zone.id } },
          body: { is_active: !zone.is_active },
        }),
      );
      toast(zone.is_active ? t("deactivated", { name: localName(zone, locale) }) : t("activated", { name: localName(zone, locale) }));
      router.refresh();
    } catch (cause) {
      setRowError({ id: zone.id, kind: errorKind(cause), errorCode: errorCode(cause) ?? null });
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {unserved.length ? (
        <Alert tone="info" data-testid="unserved-governorates">
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert className="size-4" aria-hidden />
            {t("unservedTitle", { count: unserved.length })}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {unserved.map(({ governorate, reason }) => (
              <li key={governorate.id}>
                <Badge tone="warning" data-testid="unserved-governorate" data-code={governorate.code}>
                  {localName(governorate, locale)}
                  {reason === "zoneInactive" ? ` · ${t("inInactiveZone")}` : ""}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">{t("unservedHint")}</p>
        </Alert>
      ) : (
        <Alert tone="success" data-testid="all-governorates-served">
          {t("allServed")}
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">{t("oneZoneRule")}</p>
        <Button onClick={() => setDialog({ kind: "form", zone: null })} data-testid="zone-new">
          <Plus className="size-4" aria-hidden />
          {t("new")}
        </Button>
      </div>

      {zones.length === 0 ? (
        <Card className="text-sm text-text-muted" data-testid="zones-empty">
          {t("empty")}
        </Card>
      ) : null}

      <ul className="grid gap-4 lg:grid-cols-2">
        {sortZones(zones).map((zone) => (
          <li key={zone.id}>
            <Card className={cn("flex h-full flex-col gap-3", !zone.is_active && "opacity-75")} data-testid="zone-card" data-zone={zone.name_en}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="font-bold">{localName(zone, locale)}</span>
                  <span className="text-xs text-text-muted">{localName(zone, locale === "ar" ? "en" : "ar")}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold" dir="ltr" data-testid="zone-fee">
                    {money(Number(zone.fee_iqd))}
                  </span>
                  <Badge tone={zone.is_active ? "success" : "neutral"} data-testid="zone-status">
                    {zone.is_active ? t("active") : t("inactive")}
                  </Badge>
                </div>
              </div>
              {zone.governorates.length ? (
                <ul className="flex flex-wrap gap-1.5" aria-label={t("governorates")}>
                  {zone.governorates.map((governorate) => (
                    <li key={governorate.id}>
                      <Badge data-testid="zone-governorate">{localName(governorate, locale)}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-text-muted">{t("noGovernorates")}</p>
              )}
              <div className="mt-auto flex flex-wrap justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "form", zone })} data-testid="zone-edit">
                  <Pencil className="size-4" aria-hidden />
                  {t("edit")}
                </Button>
                <Button size="sm" variant="ghost" pending={toggling === zone.id} onClick={() => void toggle(zone)} data-testid="zone-toggle">
                  <Power className="size-4" aria-hidden />
                  {zone.is_active ? t("deactivate") : t("activate")}
                </Button>
                <Button size="sm" variant="ghost" className="text-error-dark" onClick={() => setDialog({ kind: "delete", zone })} data-testid="zone-delete">
                  <Trash2 className="size-4" aria-hidden />
                  {t("delete")}
                </Button>
              </div>
              {rowError?.id === zone.id ? <FormError kind={rowError.kind} code={rowError.errorCode} /> : null}
            </Card>
          </li>
        ))}
      </ul>

      {dialog?.kind === "form" ? (
        <ZoneForm
          key={dialog.zone?.id ?? "new"}
          zone={dialog.zone}
          governorates={governorates}
          onClose={close}
          onSaved={(saved, created) => {
            toast(created ? t("created", { name: localName(saved, locale) }) : t("saved", { name: localName(saved, locale) }));
            close();
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title={t("deleteTitle", { name: dialog?.kind === "delete" ? localName(dialog.zone, locale) : "" })}
        body={t("deleteBody")}
        confirmLabel={t("delete")}
        requireReason={false}
        onClose={close}
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          await unwrap(browserApi.DELETE("/admin/delivery-zones/{id}", { params: { path: { id: dialog.zone.id } } }));
          toast(t("deleted"));
          router.refresh();
        }}
      />
    </div>
  );
}

/**
 * Create or edit a zone. The governorate list says which zone each one is in
 * now; choosing one another zone holds is flagged here, and the API refuses
 * it (one zone per governorate) — it has to leave that zone first.
 */
function ZoneForm({
  zone,
  governorates,
  onClose,
  onSaved,
}: {
  zone: DeliveryZone | null;
  governorates: AdminGovernorate[];
  onClose: () => void;
  onSaved: (zone: DeliveryZone, created: boolean) => void;
}) {
  const t = useTranslations("deliveryZones");
  const locale = useLocale();
  const api = useApiForm();
  const [nameAr, setNameAr] = useState(zone?.name_ar ?? "");
  const [nameEn, setNameEn] = useState(zone && zone.name_en !== zone.name_ar ? zone.name_en : "");
  const [fee, setFee] = useState<number | null>(zone ? Number(zone.fee_iqd) : null);
  const [active, setActive] = useState(zone?.is_active ?? true);
  const [selected, setSelected] = useState<string[]>(zone?.governorates.map((governorate) => governorate.id) ?? []);
  const [filter, setFilter] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The API's refusal names every clashing governorate and the zone holding it.
  const [refused, setRefused] = useState<ZoneConflict[] | null>(null);
  const shown = governorates.filter((governorate) => {
    const query = filter.trim().toLowerCase();
    return !query || governorate.name_ar.includes(query) || governorate.name_en.toLowerCase().includes(query);
  });

  function toggle(id: string, on: boolean) {
    setRefused(null);
    setSelected((current) => (on ? [...current, id] : current.filter((entry) => entry !== id)));
  }

  async function submit() {
    const found: Record<string, string> = {};
    if (!nameAr.trim()) found.name_ar = t("errors.nameAr");
    if (fee === null || fee < 0 || !Number.isInteger(fee)) found.fee_iqd = t("errors.fee");
    setErrors(found);
    setRefused(null);
    if (Object.keys(found).length) return;
    const body = {
      name_ar: nameAr.trim(),
      name_en: englishOrArabic(nameEn, nameAr),
      fee_iqd: fee ?? 0,
      is_active: active,
      governorate_ids: selected,
    };
    const saved = await api.run(async () => {
      try {
        return zone
          ? await unwrap(browserApi.PATCH("/admin/delivery-zones/{id}", { params: { path: { id: zone.id } }, body }))
          : await unwrap(browserApi.POST("/admin/delivery-zones", { body }));
      } catch (cause) {
        if (cause instanceof ApiError && cause.code === "GOVERNORATE_ALREADY_IN_DELIVERY_ZONE") setRefused(conflictsFromErrors(cause.errors));
        throw cause;
      }
    });
    if (saved) onSaved(saved, !zone);
  }

  const error = (name: string) => errors[name] ?? api.fieldErrors[name] ?? null;

  return (
    <FormDialog
      open
      title={zone ? t("editTitle") : t("newTitle")}
      submitLabel={zone ? t("save") : t("create")}
      pending={api.pending}
      onSubmit={() => void submit()}
      onClose={onClose}
      testId="zone-form"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("fields.nameAr")} name="name_ar" error={error("name_ar")}>
          <Input value={nameAr} dir="rtl" onChange={(e) => setNameAr(e.target.value)} data-testid="zone-name-ar" />
        </Field>
        <Field label={t("fields.nameEn")} name="name_en" error={error("name_en")} hint={t("fields.nameEnHint")}>
          <Input value={nameEn} dir="ltr" onChange={(e) => setNameEn(e.target.value)} data-testid="zone-name-en" />
        </Field>
        <Field label={t("fields.fee")} name="fee_iqd" error={error("fee_iqd")} hint={t("fields.feeHint")}>
          <NumberInput grouping value={fee} parse={{ integer: true, min: 0 }} onValueChange={setFee} data-testid="zone-fee-input" />
        </Field>
        <label className="flex items-center gap-2 self-end pb-3 text-sm font-semibold">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} data-testid="zone-active" />
          {t("fields.active")}
        </label>
      </div>

      <fieldset className="flex flex-col gap-2" data-testid="zone-governorates">
        <legend className="mb-1 text-sm font-semibold">
          {t("fields.governorates")} <span className="font-normal text-text-muted">({t("selectedCount", { count: selected.length })})</span>
        </legend>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
          <Input
            type="search"
            className="ps-9"
            value={filter}
            placeholder={t("searchGovernorate")}
            aria-label={t("searchGovernorate")}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <ul className="grid max-h-72 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
          {shown.map((governorate) => {
            const owner = governorate.delivery_zone;
            const elsewhere = owner && owner.id !== zone?.id ? owner : null;
            const checked = selected.includes(governorate.id);
            return (
              <li key={governorate.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-card",
                    checked && elsewhere && "bg-warning/10",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={(e) => toggle(governorate.id, e.target.checked)}
                    data-testid="zone-governorate-option"
                    data-code={governorate.code}
                  />
                  <span className="flex flex-col">
                    <span className="font-semibold">
                      {localName(governorate, locale)}
                      {governorate.is_active ? null : <span className="ms-1 text-xs font-normal text-text-muted">({t("governorateInactive")})</span>}
                    </span>
                    <span className="text-xs text-text-muted" data-testid="zone-governorate-owner">
                      {elsewhere ? t("inZone", { zone: localName(elsewhere, locale) }) : owner ? t("inThisZone") : t("noZoneYet")}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {refused?.length ? (
        <Alert data-testid="zone-conflict" data-source="api">
          <p className="font-semibold">{t("conflictRefused")}</p>
          <ul className="mt-1 list-disc ps-5">
            {refused.map((conflict) => (
              <li key={conflict.governorateId} data-testid="zone-conflict-item" data-governorate={conflict.governorateId} data-zone={conflict.zone.id ?? ""}>
                {t("conflictItem", { governorate: localName(conflict.governorate, locale), zone: localName(conflict.zone, locale) })}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">{t("conflictHint")}</p>
        </Alert>
      ) : refused ? (
        <Alert data-testid="zone-conflict">{t("conflictRefusedStale")}</Alert>
      ) : null}
      {refused ? null : <FormError kind={api.formError} code={api.formErrorCode} />}
    </FormDialog>
  );
}
