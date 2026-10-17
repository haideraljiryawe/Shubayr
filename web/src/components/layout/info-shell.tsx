import type { ReactNode } from "react";
import { Footer } from "./footer";
import { LocaleSwitcher } from "./locale-switcher";
import { Logo } from "./logo";

/**
 * The legal, support and account deletion pages while the store is closed
 * (STORE_PUBLIC=false, src/lib/store-gate.ts): logo, language and the footer
 * with its policy links — no search, cart, navigation or tab bar, since the
 * store behind them is still the "opening soon" page.
 */
export function InfoShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col" data-testid="info-shell">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 lg:px-8">
          <Logo showTagline={false} />
          <LocaleSwitcher />
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
