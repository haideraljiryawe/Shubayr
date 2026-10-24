"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import type { Locale } from "@/i18n/config";

/**
 * Switches the interface language: stores the choice in this browser's
 * cookie and re-renders on the server. (A per-user preference stored by the
 * API is C21's; until /me reports it, the cookie is the preference.)
 */
export function useSwitchLocale() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  async function switchTo(locale: Locale) {
    await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    });
    startTransition(() => router.refresh());
  }
  return { switchTo, pending };
}

/**
 * The light AR ⇄ EN control before sign-in (VIS-001). Signed in, the
 * language lives in the account menu (VIS-004).
 */
export function LocaleSwitch() {
  const t = useTranslations("common");
  const locale = useLocale();
  const { switchTo, pending } = useSwitchLocale();
  const next = locale === "ar" ? "en" : "ar";

  return (
    <button
      type="button"
      disabled={pending}
      data-testid="locale-switch"
      aria-label={t("switchLanguage")}
      className={buttonClasses({ variant: "ghost", size: "md", className: "px-4 text-text-muted hover:text-text" })}
      onClick={() => void switchTo(next)}
    >
      <Languages className="size-4" aria-hidden />
      <span lang={next}>{next === "ar" ? "العربية" : "English"}</span>
    </button>
  );
}
