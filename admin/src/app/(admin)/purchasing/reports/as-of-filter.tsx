"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui";

/** The aging report's as-of day, kept in the URL. */
export function AsOfFilter({ value }: { value: string }) {
  const t = useTranslations("purchasing.reports");
  const router = useRouter();
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      <span>{t("asOf")}</span>
      <Input
        type="date"
        className="w-44"
        defaultValue={value}
        onChange={(event) => router.push(event.target.value ? `/purchasing/reports?as_of=${event.target.value}` : "/purchasing/reports")}
        data-testid="aging-as-of"
      />
    </label>
  );
}
