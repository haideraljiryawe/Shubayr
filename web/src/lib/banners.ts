import type { components } from "@/types/api";

/* ---------------------------------------------------------------------------
 * Home banners as the store shows them (NOTE-001, contract 17.7.0).
 *
 * The server composes the feed — scheduling, the default banners and the
 * 0 / 1 / 2+ rule — and applies the language fallback, so the store shows the
 * feed exactly as it comes, in its order, and never fills a gap itself.
 *
 * What a banner does when pressed comes from its structured action, never a
 * default: `none` is genuinely not clickable; a product, a category or the
 * offers open the store's own page in the current language; a URL opens that
 * address (another site in a new tab). A product or category the shopper can
 * no longer see makes the banner not clickable rather than sending them
 * somewhere unrelated.
 * ------------------------------------------------------------------------- */

type ApiBanner = components["schemas"]["Banner"];

export type BannerTarget =
  | { kind: "none" }
  /** Another site: opened in a new tab, without access to this page. */
  | { kind: "external"; url: string }
  /** A store page, as a locale-free path for the localized Link. */
  | { kind: "internal"; path: string };

export interface Banner {
  id: string;
  title_ar: string;
  title_en: string;
  subtitle_ar: string;
  subtitle_en: string;
  /** The button label; none, no button. */
  cta_ar: string | null;
  cta_en: string | null;
  /** False: the artwork already carries the message — no title, subtitle or button over it. */
  show_text: boolean;
  /** The artwork (2:1). Without it the banner falls back to the brand card. */
  image_url: string | null;
  target: BannerTarget;
}

/** The store's offers listing: products on sale. */
export const OFFERS_PATH = "/search?on_sale=true";

const text = (...candidates: Array<string | null | undefined>) =>
  candidates.find((value) => typeof value === "string" && value.trim() !== "")?.trim() ?? "";

const optionalText = (...candidates: Array<string | null | undefined>) => text(...candidates) || null;

/** A link the store can follow: an http(s) address elsewhere, or a path of its own. */
export function targetForUrl(url: string | null | undefined, storeOrigin?: string): BannerTarget {
  const value = url?.trim();
  if (!value) return { kind: "none" };
  if (value.startsWith("/") && !value.startsWith("//")) return { kind: "internal", path: value };
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { kind: "none" };
    // A link to the store itself stays in the store (and in the shopper's language).
    if (storeOrigin && parsed.origin === storeOrigin) {
      const path = parsed.pathname.replace(/^\/(ar|en)(?=\/|$)/, "") || "/";
      return { kind: "internal", path: `${path}${parsed.search}${parsed.hash}` };
    }
    return { kind: "external", url: parsed.toString() };
  } catch {
    return { kind: "none" };
  }
}

export function bannerTarget(banner: ApiBanner, storeOrigin?: string): BannerTarget {
  const action = banner.action as ApiBanner["action"] | undefined;
  // An older server without structured actions: its link is the action.
  if (!action) return targetForUrl(banner.link_url, storeOrigin);
  const target = action.target;
  switch (action.type) {
    case "url":
      return targetForUrl(action.url ?? banner.link_url, storeOrigin);
    case "product":
      return target?.available && target.id
        ? { kind: "internal", path: `/product/${encodeURIComponent(target.id)}` }
        : { kind: "none" };
    case "category":
      return target?.available && target.slug
        ? { kind: "internal", path: `/category/${encodeURIComponent(target.slug)}` }
        : { kind: "none" };
    case "offers":
      return { kind: "internal", path: OFFERS_PATH };
    default:
      return { kind: "none" };
  }
}

/**
 * The contract's banner as the carousel shows it. The server already applies
 * the fallback (this language → the other → the legacy field); the same order
 * is kept here so an older or partial payload still reads correctly.
 */
export function bannerFromApi(banner: ApiBanner, index: number, storeOrigin?: string): Banner {
  return {
    id: banner.id ?? `banner-${index}`,
    title_ar: text(banner.title_ar, banner.title_en, banner.title),
    title_en: text(banner.title_en, banner.title_ar, banner.title),
    subtitle_ar: text(banner.subtitle_ar, banner.subtitle_en, banner.subtitle),
    subtitle_en: text(banner.subtitle_en, banner.subtitle_ar, banner.subtitle),
    cta_ar: optionalText(banner.cta_label_ar, banner.cta_label_en, banner.cta_text),
    cta_en: optionalText(banner.cta_label_en, banner.cta_label_ar, banner.cta_text),
    show_text: banner.show_text ?? true,
    image_url: banner.image_url?.trim() ? banner.image_url : null,
    target: bannerTarget(banner, storeOrigin),
  };
}
