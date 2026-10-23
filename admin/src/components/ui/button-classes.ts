import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // primary-dark clears WCAG AA for body-size text on white (see tokens.css).
  primary: "bg-primary-dark text-on-primary shadow-sm hover:opacity-95",
  secondary: "bg-surface text-primary-dark border border-primary hover:bg-card",
  ghost: "bg-transparent text-text hover:bg-card",
  danger: "bg-error-dark text-white shadow-sm hover:opacity-95",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  className?: string;
} = {}): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md font-semibold",
    "transition-colors duration-150 cursor-pointer whitespace-nowrap",
    "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/40 focus-visible:ring-offset-1",
    "disabled:cursor-not-allowed disabled:opacity-60",
    size === "sm" ? "h-9 px-3 text-label" : "h-11 px-5 text-label",
    BUTTON_VARIANTS[variant],
    className,
  );
}

