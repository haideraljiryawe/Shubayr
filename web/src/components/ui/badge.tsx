import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone =
  | "sale"
  | "primary"
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "neutral";

const TONES: Record<BadgeTone, string> = {
  // The «-40%» discount flag. Uses error-dark so white text clears AA (5.70:1);
  // plain --t-error would be 3.76:1.
  sale: "bg-error-dark text-white",
  primary: "bg-primary text-on-primary",
  accent: "bg-accent text-white",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  error: "bg-error/12 text-error",
  info: "bg-info/12 text-info",
  neutral: "bg-card text-text-muted",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({
  tone = "neutral",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-sm px-2 py-0.5",
        "text-xs font-semibold leading-5 whitespace-nowrap",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
