"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui";
import { useTableUrl } from "@/components/table/data-table";

/** An amount bound to one URL key, sent once typing pauses; a change returns to page 1. */
export function AmountFilter({ name, label }: { name: string; label: string }) {
  const { update, searchParams } = useTableUrl();
  const current = searchParams.get(name) ?? "";
  const [value, setValue] = useState(current);

  useEffect(() => {
    if (value.trim() === current) return;
    const timer = window.setTimeout(() => update({ [name]: value.trim() || null }), 300);
    return () => window.clearTimeout(timer);
    // The debounce keys on the text only; `update` is recreated per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <label className="flex w-full flex-col gap-1 text-sm font-semibold sm:w-36">
      <span>{label}</span>
      <Input
        value={value}
        inputMode="decimal"
        dir="ltr"
        data-testid={`filter-${name}`}
        onChange={(event) => setValue(event.target.value)}
      />
    </label>
  );
}
