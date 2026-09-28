import type { ReactNode } from "react";
import { WorkAccountGate } from "@/components/auth/work-account-gate";
import { ToastProvider } from "@/components/ui/toast";
import { BottomTabBar } from "./bottom-tab-bar";
import { Footer } from "./footer";
import { Header } from "./header";

/**
 * Header + content + footer, with the mobile tab bar pinned to the bottom.
 * `pb-24 md:pb-0` keeps the tab bar from covering the end of the page.
 *
 * A signed-in work account (API 6.0) sees only its landing page in <main>,
 * and the header and tab bar drop their shopping controls.
 *
 * The toast host lives here rather than on individual pages: adding to the cart
 * is confirmed from grids, the product page and the cart itself, and all of them
 * need somewhere for the message to land.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-col">
        <Header />
        <main className="flex-1">
          <WorkAccountGate>{children}</WorkAccountGate>
        </main>
        <Footer />
        {/* Clears the fixed bottom tab bar so the footer is fully reachable. */}
        <div className="h-24 md:hidden" aria-hidden />
        <BottomTabBar />
      </div>
    </ToastProvider>
  );
}
