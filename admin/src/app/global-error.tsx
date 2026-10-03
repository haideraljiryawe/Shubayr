"use client";

/**
 * The root layout itself failed (no translations, no stylesheet guaranteed),
 * so this renders its own document: Arabic first, plain styles.
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
          <h1 style={{ fontSize: 22, margin: 0 }}>تعذّر تحميل لوحة الإدارة</h1>
          <p style={{ margin: 0, color: "#5b6660" }}>لم نتمكن من الوصول إلى الخادم. حاول مرة أخرى بعد قليل.</p>
          <p lang="en" dir="ltr" style={{ margin: 0, color: "#5b6660", fontSize: 14 }}>
            The admin couldn&apos;t load. Please try again shortly.
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
