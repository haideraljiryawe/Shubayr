import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "light" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  // Filled brand green with readable text — the sheet's «زر أساسي».
  primary:
    "bg-primary text-on-primary shadow-sm hover:bg-primary-dark active:bg-primary-dark",
  // Outlined on white — «زر ثانوي».
  secondary:
    "bg-surface text-primary-dark border border-primary hover:bg-card",
  // Subtle warm gray-green fill — «زر خفيف».
  light: "bg-card text-primary-dark hover:bg-border",
  ghost: "bg-transparent text-text hover:bg-card",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-sm gap-1.5",
  md: "h-11 px-6 text-sm gap-2",
  lg: "h-13 px-8 text-base gap-2.5",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container width, like the sheet's «أضف إلى السلة». */
  block?: boolean;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  startIcon,
  endIcon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-semibold",
        "transition-colors duration-150 cursor-pointer",
        // Disabled wins over every variant — «زر معطل».
        "disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted",
        "disabled:border-transparent disabled:shadow-none disabled:hover:bg-border",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
      {...props}
    >
      {startIcon}
      {children}
      {endIcon}
    </button>
  );
}
