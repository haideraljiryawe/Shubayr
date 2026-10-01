"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui";

/** The payments list's supplier filter, kept in the URL. */
export function SupplierFilter({ suppliers, value }: { suppliers: Array<{ id: string; name: string }>; value: string }) {
  const t = useTranslations("purchasing.payments");
  const router = useRouter();
  return (
    <label className="flex w-full flex-col gap-1 text-sm font-semibold sm:w-72">
      <span>{t("columns.supplier")}</span>
      <Select
        value={value}
        onChange={(event) => router.push(event.target.value ? `/purchasing/payments?supplier_id=${event.target.value}` : "/purchasing/payments")}
        data-testid="filter-supplier_id"
      >
        <option value="">{t("allSuppliers")}</option>
        {suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.name}
          </option>
        ))}
      </Select>
    </label>
  );
}
