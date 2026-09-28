"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui";
import type { AccessCatalog } from "@/lib/api/access-catalog";
import { keysFromPresets } from "@/lib/permissions";
import { PermissionPicker } from "./permission-picker";
import { PresetPicker } from "./preset-picker";

/**
 * Presets + extra grants, the two halves of a staff member's access.
 * Keys a chosen preset already grants are shown locked in the extra-grants
 * picker, so an extra grant is only ever something the presets lack.
 */
export function AccessFields({
  catalog,
  presetIds,
  permissionKeys,
  onPresetIds,
  onPermissionKeys,
  errors,
}: {
  catalog: AccessCatalog | null;
  presetIds: string[];
  permissionKeys: string[];
  onPresetIds: (ids: string[]) => void;
  onPermissionKeys: (keys: string[]) => void;
  errors: Record<string, string>;
}) {
  const t = useTranslations("staff");
  const inherited = useMemo(
    () => keysFromPresets(catalog?.presets ?? [], presetIds),
    [catalog, presetIds],
  );

  if (!catalog) {
    return <Alert tone="info">{t("accessUnavailable")}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="font-bold">{t("presetsTitle")}</h3>
        <p className="text-sm text-text-muted">{t("presetsHint")}</p>
        <PresetPicker
          presets={catalog.presets}
          value={presetIds}
          onChange={(ids) => {
            onPresetIds(ids);
            // Drop extra grants the new presets now cover.
            const covered = keysFromPresets(catalog.presets, ids);
            onPermissionKeys(permissionKeys.filter((key) => !covered.has(key)));
          }}
        />
        {errors.preset_ids ? (
          <p
            className="text-xs font-semibold text-error-dark"
            data-testid="error-preset_ids"
          >
            {errors.preset_ids}
          </p>
        ) : null}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="font-bold">{t("extraTitle")}</h3>
        <p className="text-sm text-text-muted">{t("extraHint")}</p>
        <PermissionPicker
          registry={catalog.permissions}
          value={permissionKeys}
          onChange={onPermissionKeys}
          inherited={inherited}
        />
        {errors.permission_keys ? (
          <p
            className="text-xs font-semibold text-error-dark"
            data-testid="error-permission_keys"
          >
            {errors.permission_keys}
          </p>
        ) : null}
      </section>
    </div>
  );
}
