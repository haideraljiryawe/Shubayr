import type { ReactNode } from "react";
import { BottomTabBar } from "./bottom-tab-bar";
import { Footer } from "./footer";
import { Header } from "./header";

/**
 * Header + content + footer, with the mobile tab bar pinned to the bottom.
 * `pb-24 md:pb-0` keeps the tab bar from covering the end of the page.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header cartCount={3} />
      <main className="flex-1">{children}</main>
      <Footer />
      {/* Clears the fixed bottom tab bar so the footer is fully reachable. */}
      <div className="h-24 md:hidden" aria-hidden />
      <BottomTabBar />
    </div>
  );
}
