import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "cta" | "secondary" | "light" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  // Filled brand green with readable text — the sheet's «زر أساسي».
  primary:
    "bg-primary text-on-primary shadow-sm hover:bg-primary-dark active:bg-primary-dark",
  // Same shape as `primary` but filled with primary-dark, which clears WCAG AA
  // for text of any size (6.14:1 on white vs 4.31:1 for primary). Use this for
  // real calls to action — «تسوق الآن», «أضف إلى السلة» — where the label is at
  // body size. Hover dims the whole button so the text/background ratio holds.
  cta: "bg-primary-dark text-on-primary shadow-sm hover:opacity-95 active:opacity-90",
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

/**
 * The button look as a plain class string, so an anchor can be styled exactly
 * like a Button without nesting a link inside a <button> (invalid HTML) or
 * pulling in a Slot dependency. Navigation uses `<Link className={buttonClasses(...)}>`.
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  block = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
} = {}): string {
  return cn(
    "inline-flex items-center justify-center rounded-md font-semibold",
    "transition-colors duration-150 cursor-pointer",
    // Disabled wins over every variant — «زر معطل».
    "disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted",
    "disabled:border-transparent disabled:shadow-none disabled:hover:bg-border",
    VARIANTS[variant],
    SIZES[size],
    block && "w-full",
    className,
  );
}

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
      className={buttonClasses({ variant, size, block, className })}
      {...props}
    >
      {startIcon}
      {children}
      {endIcon}
    </button>
  );
}
