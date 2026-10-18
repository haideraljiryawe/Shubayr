import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSettingsOnce } from "./server-data";
import { alternatesFor, openGraphFor, storeNameFor } from "./site";
import { storeIsPublic } from "./store-gate";
import { storeInfoFrom, type StoreInfo } from "./store-info";

/* ---------------------------------------------------------------------------
 * Shared by the pages open while the store is closed: privacy, terms,
 * returns, support and account deletion (src/lib/store-gate.ts, INFO_PATHS).
 * ------------------------------------------------------------------------- */

/**
 * The store's display name and its legal, contact and policy details, from
 * the one cached settings read (src/lib/server-data.ts). The API briefly
 * unavailable gives the default name and empty info: the pages still render,
 * with neutral sentences where a detail would go.
 */
export async function infoStore(locale: string): Promise<{ storeName: string; info: StoreInfo }> {
  const settings = await getSettingsOnce().catch(() => null);
  return { storeName: await storeNameFor(locale, settings?.store_name), info: storeInfoFrom(settings) };
}

/** The store's display name, from the white-label settings. */
export async function infoStoreName(locale: string): Promise<string> {
  return (await infoStore(locale)).storeName;
}

/** Indexed once the store is public; never while it is "opening soon". */
export function infoPageMetadata(input: {
  locale: string;
  path: string;
  title: string;
  description: string;
  storeName: string;
}): Metadata {
  const indexable = storeIsPublic();
  return {
    title: input.title,
    description: input.description,
    alternates: alternatesFor(input.locale, input.path),
    openGraph: openGraphFor({
      locale: input.locale,
      siteName: input.storeName,
      title: input.title,
      description: input.description,
      path: input.path,
    }),
    robots: { index: indexable, follow: indexable },
  };
}

/** "2026-10-17" in the page's language — a calendar date, so read in UTC. */
export function formatPolicyDate(locale: string, date: string): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-IQ" : "en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** The "Last updated" line for a policy page, or null until the owner sets the date. */
export async function policyUpdatedLine(locale: string, info: StoreInfo): Promise<string | null> {
  if (!info.policyDate) return null;
  const t = await getTranslations({ locale, namespace: "legal" });
  return t("updated", { date: formatPolicyDate(locale, info.policyDate) });
}
