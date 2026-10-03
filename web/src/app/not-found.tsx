import { headers } from "next/headers";
import Link from "next/link";

/**
 * A 404 outside any locale (a path the middleware doesn't route, such as one
 * with a file extension). The root layout is a passthrough, so this renders
 * its own document — Arabic first, like the store.
 */
export default async function RootNotFound() {
  // Per request, like every page (the CSP nonce needs it).
  await headers();
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f7f5ef", color: "#1f2a24" }}>
        <main
          data-testid="not-found"
          style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}
        >
          <h1 style={{ fontSize: 24, margin: 0 }}>الصفحة غير موجودة</h1>
          <p style={{ margin: 0, color: "#5b6660" }}>ربما نُقلت هذه الصفحة أو لم تعد متاحة.</p>
          <Link href="/" style={{ marginTop: 8, padding: "10px 20px", borderRadius: 8, background: "#2f6b4f", color: "#fff", textDecoration: "none" }}>
            العودة إلى الرئيسية
          </Link>
        </main>
      </body>
    </html>
  );
}
