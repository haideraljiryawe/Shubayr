import type { components } from "@/types/api";
import type { Banner } from "./mock-data";

/**
 * The contract's banner as the home carousel shows it.
 *
 * Nothing is made up: no link means a banner that isn't clickable (not a
 * silent jump to /categories), and no button label means no button. The text
 * is stored once in the API, so both languages show it as written.
 */
export function bannerFromApi(banner: components["schemas"]["Banner"], index: number): Banner {
  const cta = banner.cta_text?.trim() ? banner.cta_text : null;
  const href = banner.link_url?.trim() ? banner.link_url : null;
  return {
    id: banner.id ?? `banner-${index}`,
    title_ar: banner.title ?? "",
    title_en: banner.title ?? "",
    subtitle_ar: banner.subtitle ?? "",
    subtitle_en: banner.subtitle ?? "",
    cta_ar: cta,
    cta_en: cta,
    href,
    image_url: banner.image_url ?? null,
  };
}
