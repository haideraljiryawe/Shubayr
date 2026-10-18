/* ---------------------------------------------------------------------------
 * Soft editorial guidance for text the store shows in small places (category
 * cards, home banners). Nothing here limits what is saved: the editor warns,
 * the full text is sent as typed.
 *
 * Lengths are counted in user-perceived characters (grapheme clusters), so an
 * Arabic letter with its harakat, an emoji with its modifiers or a flag counts
 * once — not once per UTF-16 unit or code point.
 * ------------------------------------------------------------------------- */

export interface Guide {
  /** A comfortable word range; only going over it warns. */
  words: readonly [number, number];
  /** Preferred maximum, in user-perceived characters (spaces included). */
  chars: number;
}

/** NOTE-008: names around 2–4 words, at most 24 characters. */
export const NAME_GUIDE: Guide = { words: [2, 4], chars: 24 };
/** NOTE-008: descriptions around 6–10 words, at most 60 characters. */
export const DESCRIPTION_GUIDE: Guide = { words: [6, 10], chars: 60 };
/** NOTE-001 starting points for banner text. */
export const BANNER_TITLE_GUIDE: Guide = { words: [1, 8], chars: 60 };
export const BANNER_SUBTITLE_GUIDE: Guide = { words: [1, 16], chars: 120 };

let segmenter: Intl.Segmenter | null | undefined;

/** User-perceived characters in `text`. */
export function graphemeCount(text: string): number {
  if (segmenter === undefined) {
    segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  }
  if (!segmenter) return Array.from(text).length;
  return Array.from(segmenter.segment(text)).length;
}

/** Words, split on any run of whitespace. */
export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

export interface Advice {
  chars: number;
  words: number;
  /** Over the preferred length or word count: shown with the "may be shortened" warning. */
  long: boolean;
}

export function editorialAdvice(text: string, guide: Guide): Advice {
  const chars = graphemeCount(text.trim());
  const words = wordCount(text);
  return { chars, words, long: chars > guide.chars || words > guide.words[1] };
}
