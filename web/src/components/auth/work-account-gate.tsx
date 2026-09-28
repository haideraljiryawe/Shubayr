"use client";

import type { ReactNode } from "react";
import { useWorkRole } from "@/lib/work-account";
import { WorkAccountLanding } from "./work-account-landing";

/**
 * Swap every storefront page for the work-account landing while a work
 * account is signed in. Hiding the pages is for the visitor's sake only — the
 * API refuses purchase functions to work accounts regardless.
 */
export function WorkAccountGate({ children }: { children: ReactNode }) {
  const role = useWorkRole();
  if (role) return <WorkAccountLanding role={role} />;
  return <>{children}</>;
}
