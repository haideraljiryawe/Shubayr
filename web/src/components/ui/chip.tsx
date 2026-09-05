import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Filter pill — «ترتيب» / «تصفية» in the category screen. */
export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  startIcon?: ReactNode;
}

export function Chip({
  selected = false,
  startIcon,
  className,
  children,
  ...props
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-3 h-8",
        "text-xs font-medium border transition-colors duration-150 cursor-pointer",
        selected
          ? "bg-primary text-on-primary border-primary"
          : "bg-surface text-text border-border hover:bg-card",
        className,
      )}
      {...props}
    >
      {startIcon}
      {children}
    </button>
  );
}
