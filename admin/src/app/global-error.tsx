"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/i18n/config";

/**
 * The root layout itself failed (no translations, no stylesheet guaranteed),
 * so this renders its own document with plain styles. The language is the
 * person's choice from the locale cookie, read here because the message
 * providers are gone. No error detail or stack is shown.
 */
const COPY: Record<Locale, { dir: "rtl" | "ltr"; title: string; body: string; retry: string }> = {
  ar: {
    dir: "rtl",
    title: "تعذّر تحميل لوحة الإدارة",
    body: "لم نتمكن من الوصول إلى الخادم. حاول مرة أخرى بعد قليل.",
    retry: "إعادة المحاولة",
  },
  en: {
    dir: "ltr",
    title: "The admin couldn't load",
    body: "We couldn't reach the server. Please try again shortly.",
    retry: "Try again",
  },
};

function localeFromCookie(): Locale {
  const stored = document.cookie
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === LOCALE_COOKIE)?.[1];
  return isLocale(stored) ? stored : DEFAULT_LOCALE;
}

const subscribe = () => () => {};

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useSyncExternalStore<Locale>(subscribe, localeFromCookie, () => DEFAULT_LOCALE);
  const copy = COPY[locale];
  return (
    <html lang={locale} dir={copy.dir}>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f7f5ef", color: "#1f2a24" }}>
        <main
          role="alert"
          data-testid="global-error"
          data-locale={locale}
          style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}
        >
          <h1 style={{ fontSize: 22, margin: 0 }}>{copy.title}</h1>
          <p style={{ margin: 0, color: "#5b6660" }}>{copy.body}</p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 8, padding: "10px 20px", borderRadius: 8, border: "none", background: "#2f6b4f", color: "#fff", fontSize: 16, cursor: "pointer" }}
          >
            {copy.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
