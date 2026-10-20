"use client";

import { useSyncExternalStore } from "react";

/**
 * The last line of defence: the root layout itself failed (no translations,
 * no theme), so this renders its own document with plain styles that don't
 * depend on the app's stylesheet. The language comes from the address
 * (English is prefixed `/en`, Arabic is the bare path), read here because
 * the message providers are gone. No error detail or stack is shown.
 */
const COPY = {
  ar: {
    dir: "rtl",
    title: "المتجر غير متاح مؤقتًا",
    body: "حدث خطأ غير متوقع. حاول مرة أخرى بعد قليل.",
    retry: "إعادة المحاولة",
  },
  en: {
    dir: "ltr",
    title: "The store is temporarily unavailable",
    body: "Something unexpected went wrong. Please try again shortly.",
    retry: "Try again",
  },
} as const;

type Locale = keyof typeof COPY;

function localeFromPath(): Locale {
  const path = window.location.pathname;
  return path === "/en" || path.startsWith("/en/") ? "en" : "ar";
}

const subscribe = () => () => {};

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useSyncExternalStore<Locale>(subscribe, localeFromPath, () => "ar");
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
          <h1 style={{ fontSize: 24, margin: 0 }}>{copy.title}</h1>
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
