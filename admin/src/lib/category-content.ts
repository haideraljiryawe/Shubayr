import type { Category } from "@/lib/catalog";

/* ---------------------------------------------------------------------------
 * Category descriptions (NOTE-003) in the editor.
 *
 * Admin category reads (contract 17.7.0) return description_ar and
 * description_en exactly as stored, null included, so the form shows a missing
 * translation as an empty field. (Public reads still fill an empty language
 * from the other one.) Descriptions are sent only when the editor changed
 * them, so an unrelated edit (a name, the image) never rewrites them. An
 * emptied field is sent as null, which clears it; the text is otherwise saved
 * exactly as typed.
 * ------------------------------------------------------------------------- */

export interface DescriptionDraft {
  ar: string;
  en: string;
}

export function descriptionDraft(category: Category | null): DescriptionDraft {
  return { ar: category?.description_ar ?? "", en: category?.description_en ?? "" };
}

const stored = (text: string) => (text.trim() ? text : null);

export function descriptionChanges(
  original: Category | null,
  draft: DescriptionDraft,
): { description_ar?: string | null; description_en?: string | null } {
  const loaded = descriptionDraft(original);
  const changes: { description_ar?: string | null; description_en?: string | null } = {};
  if (original === null) {
    if (stored(draft.ar) !== null) changes.description_ar = draft.ar;
    if (stored(draft.en) !== null) changes.description_en = draft.en;
    return changes;
  }
  if (draft.ar !== loaded.ar) changes.description_ar = stored(draft.ar);
  if (draft.en !== loaded.en) changes.description_en = stored(draft.en);
  return changes;
}
