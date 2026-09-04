"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { localeLabel, routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";

/** AR ⇄ EN. Swaps the locale while staying on the current path. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations("header");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const next = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  return (
    <button
      type="button"
      aria-label={t("changeLanguage")}
      title={t("changeLanguage")}
      disabled={isPending}
      onClick={() =>
        startTransition(() => {
          router.replace(pathname, { locale: next });
        })
      }
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-md px-3",
        "text-sm font-medium text-text hover:bg-card transition-colors",
        "cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed",
        className,
      )}
    >
      <Languages className="size-4.5 text-text-muted" aria-hidden />
      {localeLabel[next]}
    </button>
  );
}
