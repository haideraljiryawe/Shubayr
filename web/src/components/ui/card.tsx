import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type CardPadding = "none" | "sm" | "md" | "lg";

const PADDING: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
  /** `surface` = white tile, `muted` = the warm #F4F1EA fill. */
  tone?: "surface" | "muted";
  interactive?: boolean;
}

export function Card({
  padding = "md",
  tone = "surface",
  interactive = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border",
        tone === "surface" ? "bg-surface shadow-sm" : "bg-card",
        interactive &&
          "transition-shadow duration-150 hover:shadow-md cursor-pointer",
        PADDING[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
