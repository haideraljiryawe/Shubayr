"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui";
import {
  presetKeys,
  toggleKey,
  type PermissionPreset,
} from "@/lib/permissions";

/** Pick any number of presets — the API assigns several per user. */
export function PresetPicker({
  presets,
  value,
  onChange,
}: {
  presets: readonly PermissionPreset[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslations("presets");
  const selected = new Set(value);

  return (
    <ul className="grid gap-2 sm:grid-cols-2" data-testid="picker-preset_ids">
      {presets.map((preset) => (
        <li key={preset.id}>
          <label className="flex h-full cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-background has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-primary-dark"
              name="preset_ids"
              value={preset.id}
              data-testid={`preset-${preset.name}`}
              checked={selected.has(preset.id)}
              onChange={(event) =>
                onChange(toggleKey(value, preset.id, event.target.checked))
              }
            />
            <span className="flex flex-col gap-0.5">
              <span
                className="flex items-center gap-2 text-sm font-semibold"
                dir="ltr"
              >
                {preset.name}
                {preset.is_system ? (
                  <Badge tone="info">{t("system")}</Badge>
                ) : null}
              </span>
              {preset.description ? (
                <span className="text-xs text-text-muted">
                  {preset.description}
                </span>
              ) : null}
              <span className="text-xs text-text-muted">
                {t("permissionCount", { count: presetKeys(preset).length })}
              </span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
