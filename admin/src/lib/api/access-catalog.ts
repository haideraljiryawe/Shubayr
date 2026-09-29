import "server-only";
import type { Permission, PermissionPreset } from "../permissions";
import { listRows, load, serverApi } from "./server";

export interface AccessCatalog {
  presets: PermissionPreset[];
  permissions: Permission[];
}

/**
 * The presets and the permission registry, for the pickers.
 *
 * Both need `roles.manage`. Someone who manages staff (`users.manage`) without
 * it can still edit a profile or reset a password, so a refusal here is not
 * an error for the page — it returns null and the access section explains
 * why it is read-only.
 */
export async function loadAccessCatalog(): Promise<AccessCatalog | null> {
  const api = await serverApi();
  const [presets, permissions] = await Promise.all([
    load(api.GET("/admin/presets")),
    load(api.GET("/admin/permissions")),
  ]);
  if (!presets.ok || !permissions.ok) return null;
  return { presets: listRows(presets.data), permissions: permissions.data };
}
