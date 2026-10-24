"use client";

import { useEffect, useState } from "react";
import { useTableUrl } from "@/components/table/data-table";
import { AmountInput } from "@/components/forms/amount-input";

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
    <label className="flex w-full flex-col gap-1 text-label sm:w-36">
      <span>{label}</span>
      <AmountInput
        value={value}
        data-testid={`filter-${name}`}
        onValueChange={(value) => setValue(value)}
      />
    </label>
  );
}
