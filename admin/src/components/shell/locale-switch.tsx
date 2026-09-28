"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { buttonClasses } from "@/components/ui";

/** AR ⇄ EN: stores the choice in a cookie and re-renders on the server. */
export function LocaleSwitch() {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next = locale === "ar" ? "en" : "ar";

  return (
    <button
      type="button"
      disabled={pending}
      data-testid="locale-switch"
      aria-label={t("switchLanguage")}
      className={buttonClasses({ variant: "ghost", size: "sm" })}
      onClick={async () => {
        await fetch("/api/locale", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: next }),
        });
        startTransition(() => router.refresh());
      }}
    >
      <Languages className="size-4" aria-hidden />
      <span lang={next}>{next === "ar" ? "العربية" : "English"}</span>
    </button>
  );
}
