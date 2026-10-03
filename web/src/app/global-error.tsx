"use client";

/**
 * The last line of defence: the root layout itself failed (no translations,
 * no theme), so this renders its own document, in Arabic first, with plain
 * styles that don't depend on the app's stylesheet.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f7f5ef", color: "#1f2a24" }}>
        <main
          role="alert"
          data-testid="global-error"
          style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}
        >
          <h1 style={{ fontSize: 24, margin: 0 }}>المتجر غير متاح مؤقتًا</h1>
          <p style={{ margin: 0, color: "#5b6660" }}>حدث خطأ غير متوقع. حاول مرة أخرى بعد قليل.</p>
          <p lang="en" dir="ltr" style={{ margin: 0, color: "#5b6660", fontSize: 14 }}>
            The store is temporarily unavailable. Please try again shortly.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 8, padding: "10px 20px", borderRadius: 8, border: "none", background: "#2f6b4f", color: "#fff", fontSize: 16, cursor: "pointer" }}
          >
            إعادة المحاولة
          </button>
        </main>
      </body>
    </html>
  );
}
