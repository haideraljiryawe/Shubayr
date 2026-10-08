import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cairoVariables } from "@/fonts/cairo";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { WishlistSync } from "@/components/providers/wishlist-sync";
import { CartSync } from "@/lib/cart-sync";
import { AuthProvider } from "@/lib/auth";
import { NotificationCenterSync } from "@/lib/use-notifications";
import { localeDirection, routing, type Locale } from "@/i18n/routing";
import { api } from "@/lib/api";
import { SITE_URL, openGraphFor } from "@/lib/site";
import { OfflineNotice } from "@/components/layout/offline-notice";
import "../globals.css";
import { getSettingsOnce } from "@/lib/server-data";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/** Title/description follow the white-label store name, not a hard-coded one. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "brand" });
  const seo = await getTranslations({ locale, namespace: "seo" });
  const settings = await getSettingsOnce().catch(() => null);
  const storeName = settings?.store_name || t("name");
  const description = seo("homeDescription", { store: storeName });

  return {
    metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
    title: { default: storeName, template: `%s · ${storeName}` },
    description,
    applicationName: storeName,
    openGraph: openGraphFor({
      locale,
      siteName: storeName,
      title: storeName,
      description,
      images: settings?.logo_url ? [{ url: settings.logo_url, alt: storeName }] : undefined,
    }),
    twitter: { card: "summary", title: storeName, description },
    formatDetection: { telephone: false },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages();
  // Reading the request makes every page render per request, which the CSP
  // nonce (set by the middleware) requires.
  await headers();

  // White-label identity (rule #1). Fetched on the server so the brand is in
  // the first byte of HTML — no flash of the default green.
  const settings = await getSettingsOnce().catch(() => null);

  return (
    <html
      lang={locale}
      dir={localeDirection[locale as Locale]}
      className={cairoVariables}
      suppressHydrationWarning
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          {/* Above the shell: the header, the checkout and every account page
              ask the same provider who is signed in. */}
          <AuthProvider>
            <ThemeProvider settings={settings}>
              {/* These render nothing. The first mirrors hearts onto the
                  account; the second replays the guest cart onto the server
                  cart at sign-in and keeps the server's totals authoritative;
                  the third keeps the signed-in inbox's count and live stream. */}
              <WishlistSync />
              <CartSync />
              <NotificationCenterSync />
              <OfflineNotice />
              <AppShell>{children}</AppShell>
            </ThemeProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
