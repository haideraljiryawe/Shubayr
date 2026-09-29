"use client";

import { Input } from "@/components/ui";
import { useTableUrl } from "@/components/table/data-table";

/** A calendar day bound to one URL key; changing it returns to page 1. */
export function DateFilter({ name, label }: { name: string; label: string }) {
  const { update, searchParams } = useTableUrl();
  return (
    <label className="flex w-full flex-col gap-1 text-sm font-semibold sm:w-auto">
      <span>{label}</span>
      <Input
        type="date"
        value={searchParams.get(name) ?? ""}
        data-testid={`filter-${name}`}
        onChange={(event) => update({ [name]: event.target.value || null })}
      />
    </label>
  );
}
