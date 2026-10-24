import type { NextResponse } from "next/server";
import { COOKIE_SECURE } from "@/lib/config";
import { LOCALE_COOKIE, isLocale, type Locale } from "@/i18n/config";

/** Remember the interface language for this browser (a year). */
export function setLocaleCookie(response: NextResponse, locale: Locale): void {
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "strict",
    secure: COOKIE_SECURE,
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** The staff member's saved language (contract 17.10.0), if the user carries one. */
export function preferredLocale(user: unknown): Locale | null {
  const value = (user as { preferred_ui_language?: unknown } | null)?.preferred_ui_language;
  return typeof value === "string" && isLocale(value) ? value : null;
}
