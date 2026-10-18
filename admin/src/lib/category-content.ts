import type { Category } from "@/lib/catalog";

/* ---------------------------------------------------------------------------
 * Category descriptions (NOTE-003) in the editor.
 *
 * The API fills an empty translation from the other language when it reads a
 * category — admin reads included — so the form cannot tell a stored English
 * description from a copy of the Arabic one. Descriptions are therefore sent
 * only when the editor changed them: an unrelated edit (a name, the image)
 * never writes the copy back as a real translation. An emptied field is sent
 * as null, which clears it; the text is otherwise saved exactly as typed.
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

/** Both languages read the same: one is probably the API's fallback copy of the other. */
export function mayBeFallback(category: Category | null): boolean {
  const ar = category?.description_ar?.trim();
  return Boolean(ar) && ar === category?.description_en?.trim();
}
