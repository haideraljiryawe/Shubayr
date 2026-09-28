"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { StoreSettings } from "@/lib/api";
import { deriveBrandRamp } from "@/lib/color";

/* ---------------------------------------------------------------------------
 * WHITE-LABEL (docs/ARCHITECTURE.md rule #1)
 *
 * The store's identity — name, logo, primary color, currency — is data from
 * GET /settings, not code. The server layout fetches it and passes it here, so
 * the override ships inside the initial HTML and the brand never flashes green
 * before repainting.
 * ------------------------------------------------------------------------- */

/** Shipped defaults, straight from the Shubayr design sheet. */
export const DEFAULT_THEME = {
  storeName: "Shubayr",
  logoUrl: null as string | null,
  primaryColor: "#558464",
  currency: "USD",
} as const;

export interface Theme {
  storeName: string;
  logoUrl: string | null;
  primaryColor: string;
  currency: string;
}

const ThemeContext = createContext<Theme>({ ...DEFAULT_THEME });

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Build the `:root` override for a tenant brand. Returns null when the tenant
 * uses the default green, so the hand-tuned hexes in tokens.css stay untouched
 * rather than being replaced by derived approximations.
 */
function brandOverrideCss(primaryColor: string): string | null {
  if (primaryColor.toLowerCase() === DEFAULT_THEME.primaryColor.toLowerCase()) {
    return null;
  }

  const ramp = deriveBrandRamp(primaryColor);
  if (!ramp) return null;

  return [
    ":root{",
    `--t-primary:${ramp.primary};`,
    `--t-primary-dark:${ramp.primaryDark};`,
    `--t-primary-light:${ramp.primaryLight};`,
    `--t-on-primary:${ramp.onPrimary};`,
    "}",
  ].join("");
}

export function ThemeProvider({
  settings,
  children,
}: {
  settings: StoreSettings | null;
  children: ReactNode;
}) {
  const theme: Theme = {
    storeName: settings?.store_name || DEFAULT_THEME.storeName,
    logoUrl: settings?.logo_url || DEFAULT_THEME.logoUrl,
    primaryColor: settings?.primary_color || DEFAULT_THEME.primaryColor,
    currency: settings?.currency || DEFAULT_THEME.currency,
  };

  const override = brandOverrideCss(theme.primaryColor);

  return (
    <ThemeContext.Provider value={theme}>
      {override ? (
        <style
          data-shubayr-theme=""
          dangerouslySetInnerHTML={{ __html: override }}
        />
      ) : null}
      {children}
    </ThemeContext.Provider>
  );
}
