import type { components } from "@/types/api";

/** One registry entry with its Arabic/English name and description (contract 17.10.0). */
export type Permission = components["schemas"]["PermissionMetadata"];
export type PermissionPreset = components["schemas"]["PermissionPreset"];

export interface PermissionEntry {
  key: string;
  /** The name in the interface language (the key when the registry has none). */
  name: string;
  description: string | null;
}

export interface PermissionGroup {
  group: string;
  permissions: PermissionEntry[];
}

/** The permission's name and description in `locale`, falling back to the other language, then the key. */
export function permissionText(permission: Permission, locale: string): PermissionEntry {
  const ar = locale === "ar";
  const name = (ar ? permission.name_ar || permission.name_en : permission.name_en || permission.name_ar) || permission.key;
  const description =
    (ar ? permission.description_ar || permission.description_en : permission.description_en || permission.description_ar) ||
    permission.description ||
    null;
  return { key: permission.key, name, description };
}

/** A key's display name from the registry, or the key itself when the registry isn't available. */
export function permissionName(registry: readonly Permission[], key: string, locale: string): string {
  const found = registry.find((permission) => permission.key === key);
  return found ? permissionText(found, locale).name : key;
}

/**
 * Text folded for searching: lower case, Arabic diacritics and tatweel
 * removed, and the letter forms people type interchangeably made equal
 * (أ إ آ ٱ → ا, ى → ي, ة → ه, ؤ → و, ئ → ي), so «الاسعار» finds «الأسعار».
 */
export function foldSearchText(text: string): string {
  return text
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether a search matches the key or the name/description in either language. */
export function matchesPermission(permission: Permission, query: string): boolean {
  const needle = foldSearchText(query);
  if (!needle) return true;
  return [permission.key, permission.name_ar, permission.name_en, permission.description_ar, permission.description_en, permission.description ?? ""]
    .some((text) => foldSearchText(text ?? "").includes(needle));
}

/**
 * The registry from GET /admin/permissions, grouped by area for the picker,
 * each permission named in the interface language. Groups keep the
 * registry's own order (it lists orders first, the way the business thinks of
 * it); permissions within a group are sorted by their displayed name.
 */
export function groupPermissions(registry: readonly Permission[], locale: string, query = ""): PermissionGroup[] {
  const groups = new Map<string, PermissionGroup>();
  for (const permission of registry) {
    if (!permission.key) continue;
    const name = permission.group || permission.key.split(".")[0] || "other";
    let group = groups.get(name);
    if (!group) {
      group = { group: name, permissions: [] };
      groups.set(name, group);
    }
    if (matchesPermission(permission, query)) group.permissions.push(permissionText(permission, locale));
  }
  const collator = new Intl.Collator(locale === "ar" ? "ar" : "en");
  for (const group of groups.values()) {
    group.permissions.sort((a, b) => collator.compare(a.name, b.name) || a.key.localeCompare(b.key));
  }
  return [...groups.values()].filter((group) => group.permissions.length > 0);
}

/** The permission keys a preset grants (the API nests them one level deep). */
export function presetKeys(preset: PermissionPreset): string[] {
  return (preset.permissions ?? [])
    .map((entry) => entry.permission?.key)
    .filter((key): key is string => typeof key === "string");
}

/** Every key a set of presets grants, for showing what is inherited. */
export function keysFromPresets(
  presets: readonly PermissionPreset[],
  selectedIds: readonly string[],
): Set<string> {
  const selected = new Set(selectedIds);
  const keys = new Set<string>();
  for (const preset of presets) {
    if (selected.has(preset.id))
      for (const key of presetKeys(preset)) keys.add(key);
  }
  return keys;
}

/** Toggle one key in a list without duplicates, keeping it sorted. */
export function toggleKey(
  keys: readonly string[],
  key: string,
  on: boolean,
): string[] {
  const set = new Set(keys);
  if (on) set.add(key);
  else set.delete(key);
  return [...set].sort();
}
