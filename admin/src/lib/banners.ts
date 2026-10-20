import type { components } from "@/types/api";
import { storeDateTimeLocal, storeLocalToIso } from "@/lib/finance/dates";
import { STORE_TIME_ZONE } from "@/lib/store-time";

/* ---------------------------------------------------------------------------
 * Home banners (NOTE-001, contract 17.7.0), kept pure for unit tests.
 *
 * - Status is the API's `effective_status`, computed on server time. The
 *   admin never works it out itself.
 * - Schedules are typed and shown in Asia/Baghdad (no daylight saving).
 * - A record with only one boundary is shown as it is ("from …" / "until …")
 *   and saved back unchanged unless the editor deliberately switches it to
 *   Permanent or Scheduled.
 * - On click: none, a web link, a product, a category or the offers page. The
 *   API validates the target and returns it resolved, with `available=false`
 *   when customers can no longer see it.
 * - Arabic and English text. The API fills a missing language from the other
 *   one, then from the legacy single-language fields, so admin reads show the
 *   text customers will see. The legacy `title`/`subtitle`/`cta_text` are kept
 *   in step (Arabic first) for clients that still read them.
 * - Defaults: when no regular banner runs, the feed shows the first two usable
 *   defaults (by priority); with one regular banner it adds one default. Once
 *   two usable defaults exist, the API refuses (409) a change that would leave
 *   fewer than two.
 * - Order is replaced in one atomic call (PUT /admin/banners/order).
 * ------------------------------------------------------------------------- */

export type Banner = components["schemas"]["Banner"];
export type BannerCreate = components["schemas"]["BannerCreate"];
export type BannerPatch = components["schemas"]["BannerPatch"];
export type BannerTarget = components["schemas"]["BannerResolvedTarget"];

export const BANNER_STATUSES = ["active", "scheduled", "expired", "disabled"] as const;
export type BannerStatus = Banner["effective_status"];

export const BANNER_ACTIONS = ["none", "url", "product", "category", "offers"] as const;
export type BannerActionType = Banner["action_type"];

/** The API's own limits (BannerCreate). */
export const TITLE_MAX = 200;
export const CTA_MAX = 120;
/** The API's feed takes two defaults at most. */
export const DEFAULTS_SHOWN = 2;

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

export function filterBanners<T extends Pick<Banner, "effective_status">>(list: readonly T[], status: BannerStatus | ""): T[] {
  return status ? list.filter((banner) => banner.effective_status === status) : [...list];
}

/** Defaults the feed can use right now: enabled and inside their window. */
export function usableDefaults<T extends Pick<Banner, "is_default" | "effective_status">>(list: readonly T[]): T[] {
  return list.filter((banner) => banner.is_default && banner.effective_status === "active");
}

/** The defaults the feed would pick, in its order (priority, then place). */
export function defaultsInFeedOrder<T extends Pick<Banner, "is_default" | "effective_status" | "default_priority" | "sort_order" | "id">>(
  list: readonly T[],
): T[] {
  return usableDefaults(list).sort(
    (a, b) => a.default_priority - b.default_priority || a.sort_order - b.sort_order || a.id.localeCompare(b.id),
  );
}

/** The name the admin shows for a banner. */
export const bannerName = (banner: Pick<Banner, "internal_name" | "title">) => banner.internal_name || banner.title;

export function targetName(target: Pick<BannerTarget, "name_ar" | "name_en">, locale: string): string {
  return (locale === "ar" ? target.name_ar || target.name_en : target.name_en || target.name_ar) ?? "";
}

/* ------------------------------------------------------------------ form */

export interface PickedTarget {
  id: string;
  name_ar: string;
  name_en: string;
  /** null while unknown (just picked; the API resolves it on save). */
  available: boolean | null;
}

export interface BannerForm {
  internalName: string;
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  ctaAr: string;
  ctaEn: string;
  showText: boolean;
  action: BannerActionType;
  linkUrl: string;
  /** The product or category; kept per kind so switching back keeps the choice. */
  product: PickedTarget | null;
  category: PickedTarget | null;
  isDefault: boolean;
  defaultPriority: string;
  isActive: boolean;
  mode: ScheduleMode;
  /** datetime-local values in Asia/Baghdad. */
  starts: string;
  ends: string;
}

const local = (iso: string | null | undefined) => (iso ? storeDateTimeLocal(new Date(iso)) : "");

function savedTarget(banner: Banner | null, kind: "product" | "category"): PickedTarget | null {
  if (!banner || banner.action_type !== kind || !banner.action_target_id) return null;
  const target = banner.action.target;
  return target
    ? { id: target.id, name_ar: target.name_ar, name_en: target.name_en, available: target.available }
    : { id: banner.action_target_id, name_ar: "", name_en: "", available: false };
}

export function formFromBanner(banner: Banner | null): BannerForm {
  return {
    internalName: banner ? bannerName(banner) : "",
    titleAr: banner?.title_ar ?? "",
    titleEn: banner?.title_en ?? "",
    subtitleAr: banner?.subtitle_ar ?? "",
    subtitleEn: banner?.subtitle_en ?? "",
    ctaAr: banner?.cta_label_ar ?? "",
    ctaEn: banner?.cta_label_en ?? "",
    showText: banner?.show_text ?? true,
    action: banner?.action_type ?? "none",
    linkUrl: banner?.action_type === "url" ? (banner.action.url ?? banner.link_url ?? "") : "",
    product: savedTarget(banner, "product"),
    category: savedTarget(banner, "category"),
    isDefault: banner?.is_default ?? false,
    defaultPriority: String(banner?.default_priority ?? 0),
    // A new banner starts switched off, so nothing goes live by accident.
    isActive: banner?.is_active ?? false,
    mode: banner ? scheduleModeOf(banner) : "permanent",
    starts: local(banner?.starts_at),
    ends: local(banner?.ends_at),
  };
}

/** The product or category the form's action points at, if it needs one. */
export function formTarget(form: Pick<BannerForm, "action" | "product" | "category">): PickedTarget | null {
  if (form.action === "product") return form.product;
  if (form.action === "category") return form.category;
  return null;
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
  | { field: "internalName"; kind: "required" | "tooLong" }
  | { field: "title"; kind: "required" }
  | { field: "titleAr" | "titleEn"; kind: "tooLong" }
  | { field: "ctaAr" | "ctaEn"; kind: "tooLong" }
  | { field: "linkUrl"; kind: "required" | "invalid" }
  | { field: "target"; kind: "required" }
  | { field: "defaultPriority"; kind: "invalid" }
  | { field: "starts"; kind: "required" | "invalid" }
  | { field: "ends"; kind: "required" | "invalid" | "notAfterStart" }
  | { field: "image"; kind: "required" };

const PRIORITY = /^\d{1,6}$/;

export function validateBanner(form: BannerForm, { hasImage }: { hasImage: boolean }): BannerProblem[] {
  const problems: BannerProblem[] = [];
  const name = form.internalName.trim();
  if (!name) problems.push({ field: "internalName", kind: "required" });
  else if (name.length > TITLE_MAX) problems.push({ field: "internalName", kind: "tooLong" });
  // Text on the banner needs a title in at least one language; an image-only
  // banner needs none (the API keeps fallback text for older clients).
  if (form.showText && !form.titleAr.trim() && !form.titleEn.trim()) problems.push({ field: "title", kind: "required" });
  if (form.titleAr.trim().length > TITLE_MAX) problems.push({ field: "titleAr", kind: "tooLong" });
  if (form.titleEn.trim().length > TITLE_MAX) problems.push({ field: "titleEn", kind: "tooLong" });
  if (form.ctaAr.trim().length > CTA_MAX) problems.push({ field: "ctaAr", kind: "tooLong" });
  if (form.ctaEn.trim().length > CTA_MAX) problems.push({ field: "ctaEn", kind: "tooLong" });
  if (form.action === "url") {
    const url = form.linkUrl.trim();
    if (!url) problems.push({ field: "linkUrl", kind: "required" });
    else if (!isWebUrl(url)) problems.push({ field: "linkUrl", kind: "invalid" });
  }
  if ((form.action === "product" || form.action === "category") && !formTarget(form)) problems.push({ field: "target", kind: "required" });
  if (form.isDefault && !PRIORITY.test(form.defaultPriority.trim())) problems.push({ field: "defaultPriority", kind: "invalid" });
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

/** The click action as the API stores it. */
export function actionOf(form: BannerForm): Pick<BannerCreate, "action_type" | "action_target_id" | "link_url"> {
  return {
    action_type: form.action,
    action_target_id: formTarget(form)?.id ?? null,
    link_url: form.action === "url" ? orNull(form.linkUrl) : null,
  };
}

/** The legacy single-language fields older clients read: Arabic first. */
export function legacyText(form: BannerForm): { title: string; subtitle: string | null; cta_text: string | null } {
  return {
    title: orNull(form.titleAr) ?? orNull(form.titleEn) ?? form.internalName.trim(),
    subtitle: orNull(form.subtitleAr) ?? orNull(form.subtitleEn),
    cta_text: orNull(form.ctaAr) ?? orNull(form.ctaEn),
  };
}

const priorityOf = (form: BannerForm) => (form.isDefault ? Number(form.defaultPriority.trim()) : 0);

export function createBody(form: BannerForm, imageUrl: string, sortOrder: number): BannerCreate {
  return {
    ...legacyText(form),
    internal_name: form.internalName.trim(),
    title_ar: orNull(form.titleAr),
    title_en: orNull(form.titleEn),
    subtitle_ar: orNull(form.subtitleAr),
    subtitle_en: orNull(form.subtitleEn),
    cta_label_ar: orNull(form.ctaAr),
    cta_label_en: orNull(form.ctaEn),
    show_text: form.showText,
    image_url: imageUrl,
    ...actionOf(form),
    is_default: form.isDefault,
    default_priority: priorityOf(form),
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
  const loaded = formFromBanner(original);
  const text = [
    ["titleAr", "title_ar"],
    ["titleEn", "title_en"],
    ["subtitleAr", "subtitle_ar"],
    ["subtitleEn", "subtitle_en"],
    ["ctaAr", "cta_label_ar"],
    ["ctaEn", "cta_label_en"],
  ] as const;
  let textChanged = false;
  for (const [key, field] of text) {
    if (orNull(form[key]) !== orNull(loaded[key])) {
      patch[field] = orNull(form[key]);
      textChanged = true;
    }
  }
  if (form.internalName.trim() !== loaded.internalName.trim()) patch.internal_name = form.internalName.trim();
  if (textChanged) {
    // Keep the legacy fields in step, for clients that still read them.
    const legacy = legacyText(form);
    if (legacy.title !== original.title) patch.title = legacy.title;
    if (legacy.subtitle !== (original.subtitle ?? null)) patch.subtitle = legacy.subtitle;
    if (legacy.cta_text !== (original.cta_text ?? null)) patch.cta_text = legacy.cta_text;
  }
  if (form.showText !== original.show_text) patch.show_text = form.showText;
  if (imageUrl !== original.image_url) patch.image_url = imageUrl;
  const action = actionOf(form);
  const savedUrl = original.action_type === "url" ? (original.action.url ?? original.link_url ?? null) : null;
  if (
    action.action_type !== original.action_type ||
    action.action_target_id !== (original.action_target_id ?? null) ||
    action.link_url !== savedUrl
  ) {
    Object.assign(patch, action);
  }
  if (form.isDefault !== original.is_default) patch.is_default = form.isDefault;
  if (form.isDefault && priorityOf(form) !== original.default_priority) patch.default_priority = priorityOf(form);
  if (form.isActive !== original.is_active) patch.is_active = form.isActive;
  const schedule = scheduleOf(form);
  if (!sameInstant(schedule.starts_at, original.starts_at)) patch.starts_at = schedule.starts_at;
  if (!sameInstant(schedule.ends_at, original.ends_at)) patch.ends_at = schedule.ends_at;
  return Object.keys(patch).length ? patch : null;
}

export function nextSortOrder(list: readonly Pick<Banner, "sort_order">[]): number {
  return list.reduce((max, banner) => Math.max(max, banner.sort_order + 1), 0);
}

/** A copy for reuse: the same content, action and dates; a regular banner, switched off, placed last. */
export function duplicateBody(banner: Banner, sortOrder: number): BannerCreate {
  return {
    ...createBody(formFromBanner(banner), banner.image_url, sortOrder),
    // The legacy fields as stored, not re-derived.
    title: banner.title,
    subtitle: banner.subtitle,
    cta_text: banner.cta_text,
    is_default: false,
    default_priority: 0,
    is_active: false,
  };
}

/**
 * The complete order after moving the banner at `index` one place up (-1) or
 * down (+1) — what PUT /admin/banners/order takes (every id exactly once).
 * Null when the move goes nowhere.
 */
export function reorderIds(sorted: readonly Pick<Banner, "id">[], index: number, delta: -1 | 1): string[] | null {
  const target = index + delta;
  if (index < 0 || index >= sorted.length || target < 0 || target >= sorted.length) return null;
  const ids = sorted.map((banner) => banner.id);
  const [moved] = ids.splice(index, 1);
  ids.splice(target, 0, moved);
  return ids;
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

/* ------------------------------------------------------- category targets */

interface CategoryNode {
  id?: string;
  name_ar?: string;
  name_en?: string;
  is_visible?: boolean;
  children?: CategoryNode[];
}

/**
 * Every category in the tree as a picker option, with its path and whether
 * customers can see it (it and all its parents visible) — the same rule the
 * API uses for `available`.
 */
export function categoryOptions(tree: readonly CategoryNode[]) {
  const options: Array<{ id: string; name_ar: string; name_en: string; path_ar: string; path_en: string; visible: boolean }> = [];
  const walk = (nodes: readonly CategoryNode[], parent: { ar: string; en: string; visible: boolean } | null) => {
    for (const node of nodes) {
      if (!node.id) continue;
      const nameAr = node.name_ar || node.name_en || "";
      const nameEn = node.name_en || node.name_ar || "";
      const visible = (parent?.visible ?? true) && node.is_visible !== false;
      const path = { ar: parent ? `${parent.ar} › ${nameAr}` : nameAr, en: parent ? `${parent.en} › ${nameEn}` : nameEn, visible };
      options.push({ id: node.id, name_ar: nameAr, name_en: nameEn, path_ar: path.ar, path_en: path.en, visible });
      walk(node.children ?? [], path);
    }
  };
  walk(tree, null);
  return options;
}
