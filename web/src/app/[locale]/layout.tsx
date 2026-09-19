import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Cairo } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { WishlistSync } from "@/components/providers/wishlist-sync";
import { AuthProvider } from "@/lib/auth";
import { localeDirection, routing, type Locale } from "@/i18n/routing";
import { api } from "@/lib/api";
import "../globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-cairo",
  display: "swap",
});

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
  const settings = await api.getSettings().catch(() => null);
  const storeName = settings?.store_name || t("name");

  return {
    title: { default: storeName, template: `%s · ${storeName}` },
    description: t("tagline"),
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

  // White-label identity (rule #1). Fetched on the server so the brand is in
  // the first byte of HTML — no flash of the default green.
  const settings = await api.getSettings().catch(() => null);

  return (
    <html
      lang={locale}
      dir={localeDirection[locale as Locale]}
      className={cairo.variable}
      suppressHydrationWarning
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          {/* Above the shell: the header, the checkout and every account page
              ask the same provider who is signed in. */}
          <AuthProvider>
            <ThemeProvider settings={settings}>
              {/* Renders nothing; mirrors hearts onto the account once the
                  visitor signs in. */}
              <WishlistSync />
              <AppShell>{children}</AppShell>
            </ThemeProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
