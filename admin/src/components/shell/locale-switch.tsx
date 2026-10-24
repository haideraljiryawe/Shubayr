"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import type { Locale } from "@/i18n/config";

/**
 * Switches the interface language and re-renders on the server. Before
 * sign-in the choice is this browser's; with `account`, it is saved on the
 * signed-in staff member first (`preferred_ui_language`, VIS-004). Resolves
 * to false when that save was refused, leaving the language as it was.
 */
export function useSwitchLocale({ account = false }: { account?: boolean } = {}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  async function switchTo(locale: Locale): Promise<boolean> {
    const response = await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(account ? { locale, account: true } : { locale }),
    }).catch(() => null);
    if (!response?.ok) return false;
    startTransition(() => router.refresh());
    return true;
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
