import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cairoVariables } from "@/fonts/cairo";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { ToastProvider } from "@/components/ui/toast";
import { localeDirection, type Locale } from "@/i18n/config";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brand");
  return {
    title: { default: t("admin"), template: `%s · ${t("admin")}` },
    // An internal tool: keep it out of every index.
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = (await getLocale()) as Locale;
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      dir={localeDirection[locale]}
      className={cairoVariables}
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          <ToastProvider>{children}</ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
