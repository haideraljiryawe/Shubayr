"use client";

import { useTranslations } from "next-intl";
import { useStoreInfo, useTheme } from "@/components/providers/theme-provider";
import { telLink } from "@/lib/store-info";
import { PolicyLinks } from "@/components/legal/policy-links";
import { Logo } from "./logo";

/**
 * «تجربة تسوق أسهل … لكل ما تحتاج» + the Modern · Simple · Everywhere strap,
 * the legal and support pages on every page, and the store's phone and e-mail
 * once the owner has entered them (Settings → Store info).
 */
export function Footer() {
  const t = useTranslations();
  const { storeName } = useTheme();
  const info = useStoreInfo();

  return (
    <footer className="mt-16 border-t border-border bg-card" data-testid="site-footer">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 py-10">
        <div className="flex flex-col items-center gap-6 text-center md:flex-row md:justify-between md:text-start">
          <Logo />
          <p className="text-sm text-text-muted max-w-md">
            {t("footer.tagline")}
          </p>
        </div>

        <PolicyLinks className="mt-8" />

        {info.phone || info.email ? (
          <p
            className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-text-muted md:justify-start"
            data-testid="footer-contact"
          >
            <span>{t("footer.contact")}</span>
            {info.phone ? (
              <a href={telLink(info.phone)} dir="ltr" className="[unicode-bidi:isolate] hover:text-primary-dark" data-testid="footer-phone">
                {info.phone}
              </a>
            ) : null}
            {info.email ? (
              <a href={`mailto:${info.email}`} dir="ltr" className="[unicode-bidi:isolate] hover:text-primary-dark" data-testid="footer-email">
                {info.email}
              </a>
            ) : null}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col items-center gap-2 border-t border-border pt-6 text-sm text-text-muted md:flex-row md:justify-between">
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
