"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, MapPin, Plus } from "lucide-react";
import { AccountError, AccountSkeleton } from "@/components/account/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Radio } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import type { Address, Governorate } from "@/lib/api";
import { cn } from "@/lib/cn";
import { deliveryProblem, governorateName } from "@/lib/delivery";

/**
 * The signed-in half of the checkout's address step: pick a saved address, or
 * switch to typing a new one.
 *
 * Presentational on purpose: the flow owns the list and the selection, so the
 * preselected default is derived during render rather than announced back up
 * through a callback.
 *
 * Each address names its governorate, which sets the delivery fee. One saved
 * before governorates existed is asked for it here, in place; one in a
 * governorate not served yet says so, and cannot be continued with.
 */
export function SavedAddresses({
  addresses,
  loading,
  failed,
  onRetry,
  selectedId,
  onSelect,
  onUseNew,
  governorates,
  onSetGovernorate,
}: {
  addresses: Address[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (address: Address) => void;
  onUseNew: () => void;
  governorates: ReadonlyMap<string, Governorate>;
  /** Saves a governorate on an address that has none; rejects on failure. */
  onSetGovernorate: (address: Address, governorateId: string) => Promise<void>;
}) {
  const t = useTranslations("addresses");
  const locale = useLocale();

  if (failed) return <AccountError message={t("loadError")} onRetry={onRetry} />;
  if (loading) return <AccountSkeleton rows={2} />;
  if (addresses.length === 0) return null;

  return (
    <Card padding="md" className="flex flex-col gap-3">
      <h2 className="text-base font-bold text-text">{t("chooseSaved")}</h2>

      <ul className="flex flex-col gap-2" data-testid="saved-addresses">
        {addresses.map((address) => {
          const selected = address.id === selectedId;

          return (
            <li key={address.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                  selected
                    ? "border-primary bg-primary/8"
                    : "border-border hover:bg-card",
                )}
              >
                <Radio
                  name="saved-address"
                  value={address.id}
                  checked={selected}
                  data-testid="saved-address-option"
                  onChange={() => onSelect(address)}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-text">
                      {address.label}
                    </span>
                    {address.is_default ? (
                      <Badge tone="success">{t("default")}</Badge>
                    ) : null}
                  </span>
                  <span className="mt-1 flex gap-1.5 text-sm text-text-muted">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>
                      {[
                        address.governorate_id && governorates.get(address.governorate_id)
                          ? governorateName(governorates.get(address.governorate_id)!, locale)
                          : null,
                        address.city,
                        address.area,
                        address.street,
                      ]
                        .filter(Boolean)
                        .join(" — ")}
                    </span>
                  </span>
                  <AddressDelivery
                    address={address}
                    governorates={governorates}
                    onSetGovernorate={onSetGovernorate}
                  />
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <Button
        variant="secondary"
        onClick={onUseNew}
        data-testid="use-new-address"
        startIcon={<Plus className="size-4" aria-hidden />}
        className="self-start"
      >
        {t("useNew")}
      </Button>
    </Card>
  );
}

/** Under an address: nothing when it can be delivered to; else what to do. */
function AddressDelivery({
  address,
  governorates,
  onSetGovernorate,
}: {
  address: Address;
  governorates: ReadonlyMap<string, Governorate>;
  onSetGovernorate: (address: Address, governorateId: string) => Promise<void>;
}) {
  const t = useTranslations("addresses");
  const locale = useLocale();
  const [choice, setChoice] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const problem = governorates.size ? deliveryProblem(address, governorates) : null;
  if (!problem) return null;

  if (problem === "unserved") {
    const known = address.governorate_id ? governorates.get(address.governorate_id) : undefined;
    return (
      <span
        role="alert"
        className="mt-2 flex items-start gap-1.5 text-sm font-medium text-error-dark"
        data-testid="saved-address-unserved"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        {known ? t("unserved", { name: governorateName(known, locale) }) : t("unservedUnknown")}
      </span>
    );
  }

  return (
    <span className="mt-2 flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/8 p-2" data-testid="saved-address-missing-governorate">
      <span className="text-sm font-medium text-text">{t("missingGovernorate")}</span>
      <span className="flex flex-wrap gap-2">
        <Select
          value={choice}
          placeholder={t("governoratePlaceholder")}
          aria-label={t("governorate")}
          onChange={(event) => setChoice(event.target.value)}
          data-testid="saved-address-governorate"
          className="min-w-44 flex-1"
        >
          {[...governorates.values()].map((governorate) => (
            <option key={governorate.id} value={governorate.id}>
              {governorateName(governorate, locale)}
              {governorate.is_served ? "" : ` — ${t("governorateNotServedYet")}`}
            </option>
          ))}
        </Select>
        <Button
          variant="secondary"
          size="sm"
          disabled={!choice || saving}
          data-testid="saved-address-governorate-save"
          onClick={async (event) => {
            event.preventDefault();
            setSaving(true);
            setFailed(false);
            try {
              await onSetGovernorate(address, choice);
            } catch {
              setFailed(true);
            } finally {
              setSaving(false);
            }
          }}
        >
          {t("saveGovernorate")}
        </Button>
      </span>
      {failed ? <span className="text-xs text-error-dark">{t("saveGovernorateFailed")}</span> : null}
    </span>
  );
}
