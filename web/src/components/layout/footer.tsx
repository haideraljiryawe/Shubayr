"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "@/components/providers/theme-provider";
import { Logo } from "./logo";

/** «تجربة تسوق أسهل … لكل ما تحتاج» + the Modern · Simple · Everywhere strap. */
export function Footer() {
  const t = useTranslations();
  const { storeName } = useTheme();

  return (
    <footer className="mt-16 border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 py-10">
        <div className="flex flex-col items-center gap-6 text-center md:flex-row md:justify-between md:text-start">
          <Logo />
          <p className="text-sm text-text-muted max-w-md">
            {t("footer.tagline")}
          </p>
        </div>

        <div className="mt-8 flex flex-col items-center gap-2 border-t border-border pt-6 text-sm text-text-muted md:flex-row md:justify-between">
          <p className="font-medium text-text">
            {storeName}
            <span className="mx-2 text-border">|</span>
            {t("brand.strapline")}
          </p>
          <p className="text-xs">
            © {new Date().getFullYear()} {storeName} — {t("footer.rights")}
          </p>
        </div>
      </div>
    </footer>
  );
}
