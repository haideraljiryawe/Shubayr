import type { components } from "@/types/api";

export type Permission = components["schemas"]["Permission"];
export type PermissionPreset = components["schemas"]["PermissionPreset"];

export interface PermissionGroup {
  group: string;
  permissions: Array<{ key: string; description: string | null }>;
}

/**
 * The registry from GET /admin/permissions, grouped by area for the picker.
 * Groups keep the registry's own order (it lists orders first, the way the
 * business thinks of it); keys within a group are sorted for scanning.
 */
export function groupPermissions(
  registry: readonly Permission[],
): PermissionGroup[] {
  const groups = new Map<string, PermissionGroup>();
  for (const permission of registry) {
    if (!permission.key) continue;
    const name = permission.group || permission.key.split(".")[0] || "other";
    let group = groups.get(name);
    if (!group) {
      group = { group: name, permissions: [] };
      groups.set(name, group);
    }
    group.permissions.push({
      key: permission.key,
      description: permission.description ?? null,
    });
  }
  for (const group of groups.values()) {
    group.permissions.sort((a, b) => a.key.localeCompare(b.key));
  }
  return [...groups.values()];
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
