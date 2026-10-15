"use client";

import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MapPin } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import type { Locale } from "@/i18n/routing";
import type { Address, Governorate } from "@/lib/api";
import { governorateName, type DeliveryProblem } from "@/lib/delivery";
import { formatPrice } from "@/lib/format";

/**
 * Where the cart is going, so the delivery fee and the full total show
 * before checkout (API 16.2): a governorate for a guest, a saved address for
 * a signed-in shopper who has one. Each governorate says its fee — or that it
 * is not delivered to yet.
 */
export function DeliveryPicker({
  governorates,
  addresses,
  governorateId,
  addressId,
  problem,
  onGovernorate,
  onAddress,
}: {
  governorates: Governorate[];
  /** The signed-in shopper's saved addresses; empty for a guest. */
  addresses: Address[];
  governorateId: string | null;
  addressId: string | null;
  problem: DeliveryProblem | null;
  onGovernorate: (id: string | null) => void;
  onAddress: (address: Address) => void;
}) {
  const t = useTranslations("cart");
  const tc = useTranslations("checkout");
  const locale = useLocale() as Locale;
  const { currency } = useTheme();
  const id = useId();
  const byId = new Map(governorates.map((governorate) => [governorate.id, governorate]));
  const option = (governorate: Governorate) =>
    governorate.is_served && governorate.delivery_fee !== null
      ? t("governorateFee", { name: governorateName(governorate, locale), fee: formatPrice(Number(governorate.delivery_fee), currency, locale) })
      : `${governorateName(governorate, locale)} — ${tc("governorateNotServedYet")}`;
  const chosenAddress = addresses.find((address) => address.id === addressId) ?? null;
  const problemGovernorate = chosenAddress?.governorate_id ?? governorateId;
  const problemName = problemGovernorate && byId.get(problemGovernorate) ? governorateName(byId.get(problemGovernorate)!, locale) : null;

  return (
    <Card padding="md" className="flex flex-col gap-2" data-testid="delivery-picker">
      <h2 className="flex items-center gap-2 text-base font-bold text-text">
        <MapPin className="size-4 text-primary-dark" aria-hidden />
        {t("deliveryTo")}
      </h2>
      {addresses.length > 0 ? (
        <Field label={t("savedAddress")} htmlFor={id}>
          <Select
            id={id}
            value={addressId ?? ""}
            onChange={(event) => {
              const address = addresses.find((item) => item.id === event.target.value);
              if (address) onAddress(address);
            }}
            data-testid="cart-delivery-address"
          >
            {addresses.map((address) => {
              const governorate = address.governorate_id ? byId.get(address.governorate_id) : undefined;
              return (
                <option key={address.id} value={address.id ?? ""}>
                  {[address.label, address.city, governorate ? governorateName(governorate, locale) : null].filter(Boolean).join(" · ")}
                </option>
              );
            })}
          </Select>
        </Field>
      ) : (
        <Field label={t("governorate")} htmlFor={id} hint={governorateId ? undefined : t("chooseGovernorate")}>
          <Select
            id={id}
            value={governorateId ?? ""}
            placeholder={tc("governoratePlaceholder")}
            onChange={(event) => onGovernorate(event.target.value || null)}
            data-testid="cart-delivery-governorate"
          >
            {governorates.map((governorate) => (
              <option key={governorate.id} value={governorate.id}>
                {option(governorate)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {problem ? (
        <p role="alert" data-testid="cart-delivery-problem" className="text-sm font-medium text-error-dark">
          {problem === "missingGovernorate"
            ? tc("delivery.missingGovernorate")
            : problemName
              ? tc("delivery.unserved", { name: problemName })
              : tc("delivery.unservedUnknown")}
        </p>
      ) : null}
    </Card>
  );
}
