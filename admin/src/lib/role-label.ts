import type { components } from "@/types/api";

export type PresetIdentity = components["schemas"]["StaffPresetIdentity"];

const SEPARATOR = { ar: "، ", en: ", " } as const;

/**
 * The staff member's role under their name in the account menu: their
 * presets' names in the interface language (17.12.0 puts both on /me),
 * joined the way that language lists things. No presets (an owner with only
 * direct grants) → null: nothing is shown rather than a guess.
 */
export function roleLabel(presets: readonly PresetIdentity[] | null | undefined, locale: string): string | null {
  const language = locale === "en" ? "en" : "ar";
  const names: string[] = [];
  for (const preset of presets ?? []) {
    const name = (language === "ar" ? preset.name_ar : preset.name_en).trim() || preset.name.trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names.length ? names.join(SEPARATOR[language]) : null;
}
