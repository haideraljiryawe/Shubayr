"use client";

import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { IconButton } from "@/components/ui/icon-button";
import { SearchInput } from "@/components/ui/search-input";

/** Native GET works before hydration and leaves a shareable search URL. */
export function SearchForm({ defaultQuery = "" }: { defaultQuery?: string }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("header");

  return (
    <form
      action={getPathname({ locale, href: "/search" })}
      method="get"
      role="search"
      aria-label={t("search")}
    >
      <SearchInput
        name="q"
        defaultValue={defaultQuery}
        aria-label={t("search")}
        placeholder={t("searchPlaceholder")}
        enterKeyHint="search"
        maxLength={200}
        endIcon={
          <IconButton
            type="submit"
            label={t("search")}
            size="sm"
            variant="ghost"
          >
            <ArrowLeft className="size-4.5 ltr:rotate-180" aria-hidden />
          </IconButton>
        }
      />
    </form>
  );
}
