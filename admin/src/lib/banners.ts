import type { components } from "@/types/api";
import { storeDateTimeLocal, storeLocalToIso } from "@/lib/finance/dates";
import { STORE_TIME_ZONE } from "@/lib/store-time";

/* ---------------------------------------------------------------------------
 * Home banners (NOTE-001) on the existing API, kept pure for unit tests.
 *
 * - Effective status mirrors the public feed (GET /banners): enabled, and now
 *   within the optional window, both ends inclusive. Disabled wins whenever
 *   the switch is off; an enabled banner past its end is Expired, never
 *   Active.
 * - Schedules are typed and shown in Asia/Baghdad (no daylight saving).
 * - A record with only one boundary is shown as it is ("from …" / "until …")
 *   and saved back unchanged unless the editor deliberately switches it to
 *   Permanent or Scheduled.
 * - Click behaviour is what the API holds today: an optional absolute URL and
 *   an optional button label. Product / category / offers actions wait for the
 *   next contract.
 * ------------------------------------------------------------------------- */

export type Banner = components["schemas"]["Banner"];
export type BannerCreate = components["schemas"]["BannerCreate"];
export type BannerPatch = components["schemas"]["BannerPatch"];

export const BANNER_STATUSES = ["active", "scheduled", "expired", "disabled"] as const;
export type BannerStatus = (typeof BANNER_STATUSES)[number];

/** The API's own limits (BannerCreate). */
export const TITLE_MAX = 200;
export const CTA_MAX = 120;

type Window = Pick<Banner, "is_active" | "starts_at" | "ends_at">;

export function bannerStatus(banner: Window, now: Date): BannerStatus {
  if (!banner.is_active) return "disabled";
  const at = now.getTime();
  if (banner.starts_at && at < new Date(banner.starts_at).getTime()) return "scheduled";
  if (banner.ends_at && at > new Date(banner.ends_at).getTime()) return "expired";
  return "active";
}

export type ScheduleMode = "permanent" | "scheduled" | "startOnly" | "endOnly";

export function scheduleModeOf(banner: Pick<Banner, "starts_at" | "ends_at">): ScheduleMode {
  if (banner.starts_at && banner.ends_at) return "scheduled";
  if (banner.starts_at) return "startOnly";
  if (banner.ends_at) return "endOnly";
  return "permanent";
}

/** The API's order: sort_order, then creation, then id. */
export function sortBanners<T extends Pick<Banner, "sort_order" | "created_at" | "id">>(list: readonly T[]): T[] {
  return [...list].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}

export function filterBanners<T extends Window>(list: readonly T[], status: BannerStatus | "", now: Date): T[] {
  return status ? list.filter((banner) => bannerStatus(banner, now) === status) : [...list];
}

/* ------------------------------------------------------------------ form */

export interface BannerForm {
  title: string;
  subtitle: string;
  ctaText: string;
  linkUrl: string;
  isActive: boolean;
  mode: ScheduleMode;
  /** datetime-local values in Asia/Baghdad. */
  starts: string;
  ends: string;
}

const local = (iso: string | null | undefined) => (iso ? storeDateTimeLocal(new Date(iso)) : "");

export function formFromBanner(banner: Banner | null): BannerForm {
  return {
    title: banner?.title ?? "",
    subtitle: banner?.subtitle ?? "",
    ctaText: banner?.cta_text ?? "",
    linkUrl: banner?.link_url ?? "",
    // A new banner starts switched off, so nothing goes live by accident.
    isActive: banner?.is_active ?? false,
    mode: banner ? scheduleModeOf(banner) : "permanent",
    starts: local(banner?.starts_at),
    ends: local(banner?.ends_at),
  };
}

/** Which modes the form offers: one-boundary modes only for a record already saved that way. */
export function modeChoices(original: Banner | null): ScheduleMode[] {
  const saved = original ? scheduleModeOf(original) : "permanent";
  return saved === "startOnly" || saved === "endOnly" ? ["permanent", "scheduled", saved] : ["permanent", "scheduled"];
}

/**
 * Switching modes: what the new mode needs filled in, and which saved dates
 * it will drop — so the form can say "the end date … will be removed".
 */
export function switchMode(form: BannerForm, mode: ScheduleMode): { form: BannerForm; drops: { starts: string | null; ends: string | null } } {
  const keepsStart = mode === "scheduled" || mode === "startOnly";
  const keepsEnd = mode === "scheduled" || mode === "endOnly";
  return {
    form: { ...form, mode },
    drops: {
      starts: !keepsStart && form.starts ? form.starts : null,
      ends: !keepsEnd && form.ends ? form.ends : null,
    },
  };
}

export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export type BannerProblem =
  | { field: "title"; kind: "required" | "tooLong" }
  | { field: "ctaText"; kind: "tooLong" }
  | { field: "linkUrl"; kind: "invalid" }
  | { field: "starts"; kind: "required" | "invalid" }
  | { field: "ends"; kind: "required" | "invalid" | "notAfterStart" }
  | { field: "image"; kind: "required" };

export function validateBanner(form: BannerForm, { hasImage }: { hasImage: boolean }): BannerProblem[] {
  const problems: BannerProblem[] = [];
  const title = form.title.trim();
  if (!title) problems.push({ field: "title", kind: "required" });
  else if (title.length > TITLE_MAX) problems.push({ field: "title", kind: "tooLong" });
  if (form.ctaText.length > CTA_MAX) problems.push({ field: "ctaText", kind: "tooLong" });
  if (form.linkUrl.trim() && !isWebUrl(form.linkUrl.trim())) problems.push({ field: "linkUrl", kind: "invalid" });
  const needsStart = form.mode === "scheduled" || form.mode === "startOnly";
  const needsEnd = form.mode === "scheduled" || form.mode === "endOnly";
  const starts = needsStart ? storeLocalToIso(form.starts) : null;
  const ends = needsEnd ? storeLocalToIso(form.ends) : null;
  if (needsStart && !starts) problems.push({ field: "starts", kind: form.starts ? "invalid" : "required" });
  if (needsEnd && !ends) problems.push({ field: "ends", kind: form.ends ? "invalid" : "required" });
  if (starts && ends && new Date(ends) <= new Date(starts)) problems.push({ field: "ends", kind: "notAfterStart" });
  if (!hasImage) problems.push({ field: "image", kind: "required" });
  return problems;
}

/** The window the form describes, as the API stores it. */
export function scheduleOf(form: BannerForm): { starts_at: string | null; ends_at: string | null } {
  const keepsStart = form.mode === "scheduled" || form.mode === "startOnly";
  const keepsEnd = form.mode === "scheduled" || form.mode === "endOnly";
  return {
    starts_at: keepsStart ? storeLocalToIso(form.starts) : null,
    ends_at: keepsEnd ? storeLocalToIso(form.ends) : null,
  };
}

const orNull = (value: string) => (value.trim() ? value.trim() : null);

export function createBody(form: BannerForm, imageUrl: string, sortOrder: number): BannerCreate {
  return {
    title: form.title.trim(),
    subtitle: orNull(form.subtitle),
    image_url: imageUrl,
    cta_text: orNull(form.ctaText),
    link_url: orNull(form.linkUrl),
    sort_order: sortOrder,
    is_active: form.isActive,
    ...scheduleOf(form),
  };
}

const sameInstant = (a: string | null, b: string | null) =>
  a === b || (a !== null && b !== null && new Date(a).getTime() === new Date(b).getTime());

/** Only what changed; null when nothing did (the API wants at least one field). */
export function patchBody(form: BannerForm, original: Banner, imageUrl: string): BannerPatch | null {
  const patch: BannerPatch = {};
  const title = form.title.trim();
  if (title !== original.title) patch.title = title;
  if (orNull(form.subtitle) !== (original.subtitle ?? null)) patch.subtitle = orNull(form.subtitle);
  if (imageUrl !== original.image_url) patch.image_url = imageUrl;
  if (orNull(form.ctaText) !== (original.cta_text ?? null)) patch.cta_text = orNull(form.ctaText);
  if (orNull(form.linkUrl) !== (original.link_url ?? null)) patch.link_url = orNull(form.linkUrl);
  if (form.isActive !== original.is_active) patch.is_active = form.isActive;
  const schedule = scheduleOf(form);
  if (!sameInstant(schedule.starts_at, original.starts_at)) patch.starts_at = schedule.starts_at;
  if (!sameInstant(schedule.ends_at, original.ends_at)) patch.ends_at = schedule.ends_at;
  return Object.keys(patch).length ? patch : null;
}

export function nextSortOrder(list: readonly Pick<Banner, "sort_order">[]): number {
  return list.reduce((max, banner) => Math.max(max, banner.sort_order + 1), 0);
}

/** A copy for reuse: the same content and dates, switched off, placed last. */
export function duplicateBody(banner: Banner, sortOrder: number): BannerCreate {
  return {
    title: banner.title,
    subtitle: banner.subtitle,
    image_url: banner.image_url,
    cta_text: banner.cta_text,
    link_url: banner.link_url,
    sort_order: sortOrder,
    is_active: false,
    starts_at: banner.starts_at,
    ends_at: banner.ends_at,
  };
}

/**
 * Move the banner at `index` one place up (-1) or down (+1) in the displayed
 * order. Distinct neighbours just swap their sort orders (two writes); if any
 * two banners share a sort order, the creation-time tie-break could undo a
 * swap, so the list is renumbered 0…n-1 and only the banners whose number
 * changes are written.
 */
export function reorderPatches(
  sorted: readonly Pick<Banner, "id" | "sort_order">[],
  index: number,
  delta: -1 | 1,
): Array<{ id: string; sort_order: number }> {
  const target = index + delta;
  if (index < 0 || index >= sorted.length || target < 0 || target >= sorted.length) return [];
  const orders = sorted.map((banner) => banner.sort_order);
  const distinct = new Set(orders).size === orders.length;
  if (distinct) {
    return [
      { id: sorted[index].id, sort_order: sorted[target].sort_order },
      { id: sorted[target].id, sort_order: sorted[index].sort_order },
    ];
  }
  const moved = [...sorted];
  const [item] = moved.splice(index, 1);
  moved.splice(target, 0, item);
  return moved.flatMap((banner, position) => (banner.sort_order === position ? [] : [{ id: banner.id, sort_order: position }]));
}

/** "19/10/2026 00:00" in Asia/Baghdad. */
export function baghdadText(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-IQ-u-nu-latn" : "en-GB", {
    timeZone: STORE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}
