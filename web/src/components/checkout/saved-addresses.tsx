"use client";

import { useTranslations } from "next-intl";
import { MapPin, Plus } from "lucide-react";
import { AccountError, AccountSkeleton } from "@/components/account/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Radio } from "@/components/ui/radio";
import type { Address } from "@/lib/api";
import { cn } from "@/lib/cn";

/**
 * The signed-in half of the checkout's address step: pick a saved address, or
 * switch to typing a new one.
 *
 * Presentational on purpose: the flow owns the list and the selection, so the
 * preselected default is derived during render rather than announced back up
 * through a callback.
 */
export function SavedAddresses({
  addresses,
  loading,
  failed,
  onRetry,
  selectedId,
  onSelect,
  onUseNew,
}: {
  addresses: Address[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (address: Address) => void;
  onUseNew: () => void;
}) {
  const t = useTranslations("addresses");

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
                      {[address.city, address.area, address.street]
                        .filter(Boolean)
                        .join(" — ")}
                    </span>
                  </span>
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
