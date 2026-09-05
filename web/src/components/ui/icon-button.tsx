import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type IconButtonVariant = "surface" | "primary" | "ghost";

const VARIANTS: Record<IconButtonVariant, string> = {
  surface: "bg-surface text-text shadow-sm hover:bg-card",
  primary: "bg-primary text-on-primary shadow-md hover:bg-primary-dark",
  ghost: "bg-transparent text-text hover:bg-card",
};

const SIZES = {
  sm: "size-8",
  md: "size-10",
  lg: "size-12",
} as const;

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required — icon-only controls need an accessible name. */
  label: string;
  variant?: IconButtonVariant;
  size?: keyof typeof SIZES;
  children: ReactNode;
}

export function IconButton({
  label,
  variant = "surface",
  size = "md",
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-full cursor-pointer",
        "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
