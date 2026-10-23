import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";

/** Render inside the real Arabic or English messages, with the page direction. */
export function renderIn(locale: "ar" | "en", ui: ReactNode) {
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = locale;
  return render(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en} timeZone="Asia/Baghdad">
        {children}
      </NextIntlClientProvider>
    ),
  });
}
