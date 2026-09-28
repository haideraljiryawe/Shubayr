"use client";

import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { isWorkPath, useWorkRole } from "@/lib/work-account";
import { WorkAccountLanding } from "./work-account-landing";

/**
 * Swap every storefront page for the work-account landing while a work
 * account is signed in — except the work pages and the inbox, which are what
 * the account is for. Hiding the pages is for the visitor's sake only — the
 * API refuses purchase functions to work accounts regardless.
 */
export function WorkAccountGate({ children }: { children: ReactNode }) {
  const role = useWorkRole();
  const pathname = usePathname();
  if (role && !isWorkPath(pathname)) return <WorkAccountLanding role={role} />;
  return <>{children}</>;
}
