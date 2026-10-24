import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The type roles from globals.css (`@theme --text-*`). Without them, twMerge
// reads `text-label` as a colour and drops it next to `text-text-muted`.
export const TYPE_ROLES = ["page-title", "section", "body", "control", "label", "table-head", "caption", "badge"];

const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: TYPE_ROLES }] } },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
