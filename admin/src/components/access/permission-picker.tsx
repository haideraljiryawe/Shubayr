"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  groupPermissions,
  toggleKey,
  type Permission,
} from "@/lib/permissions";

/**
 * The permission registry, grouped by area, as checkboxes.
 *
 * `inherited` marks keys already granted another way (by the presets picked
 * above it), which are shown checked and locked so an "extra grant" is never
 * a silent duplicate. A group heading toggles the whole area, with the
 * indeterminate state when only some are chosen.
 */
export function PermissionPicker({
  registry,
  value,
  onChange,
  inherited = new Set<string>(),
  name = "permission_keys",
}: {
  registry: readonly Permission[];
  value: readonly string[];
  onChange: (keys: string[]) => void;
  inherited?: ReadonlySet<string>;
  name?: string;
}) {
  const t = useTranslations("permissions");
  const tGroups = useTranslations("permissionGroups");
  const [filter, setFilter] = useState("");
  const selected = useMemo(() => new Set(value), [value]);

  const groups = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase();
    return groupPermissions(registry)
      .map((group) => ({
        ...group,
        permissions: group.permissions.filter(
          (permission) =>
            !needle ||
            permission.key.toLocaleLowerCase().includes(needle) ||
            (permission.description ?? "").toLocaleLowerCase().includes(needle),
        ),
      }))
      .filter((group) => group.permissions.length > 0);
  }, [registry, filter]);

  const groupLabel = (group: string) =>
    tGroups.has(group) ? tGroups(group) : group;

  return (
    <div className="flex flex-col gap-3" data-testid={`picker-${name}`}>
      <Input
        type="search"
        placeholder={t("filter")}
        aria-label={t("filter")}
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map((group) => {
          const own = group.permissions.filter(
            (item) => !inherited.has(item.key),
          );
          const chosen = own.filter((item) => selected.has(item.key)).length;
          const all = own.length > 0 && chosen === own.length;
          return (
            <fieldset
              key={group.group}
              className="rounded-md border border-border p-3"
              data-group={group.group}
            >
              <legend className="px-1">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary-dark"
                    checked={all}
                    disabled={own.length === 0}
                    ref={(input) => {
                      if (input) input.indeterminate = chosen > 0 && !all;
                    }}
                    onChange={(event) => {
                      let next = [...value];
                      for (const item of own)
                        next = toggleKey(next, item.key, event.target.checked);
                      onChange(next);
                    }}
                  />
                  {groupLabel(group.group)}
                  <span className="text-xs font-normal text-text-muted">
                    {t("count", {
                      chosen: chosen + (group.permissions.length - own.length),
                      total: group.permissions.length,
                    })}
                  </span>
                </label>
              </legend>
              <ul className="mt-1 flex flex-col gap-1.5">
                {group.permissions.map((permission) => {
                  const locked = inherited.has(permission.key);
                  return (
                    <li key={permission.key}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-start gap-2 text-sm",
                          locked && "cursor-default opacity-70",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 accent-primary-dark"
                          name={name}
                          value={permission.key}
                          data-testid={`perm-${permission.key}`}
                          checked={locked || selected.has(permission.key)}
                          disabled={locked}
                          onChange={(event) =>
                            onChange(
                              toggleKey(
                                value,
                                permission.key,
                                event.target.checked,
                              ),
                            )
                          }
                        />
                        <span className="flex flex-col">
                          <code className="text-xs font-semibold" dir="ltr">
                            {permission.key}
                          </code>
                          {permission.description ? (
                            <span className="text-xs text-text-muted">
                              {permission.description}
                            </span>
                          ) : null}
                          {locked ? (
                            <span className="text-xs text-info-dark">
                              {t("fromPreset")}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
