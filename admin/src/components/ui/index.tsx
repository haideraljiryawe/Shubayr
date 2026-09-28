import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

/* ---------------------------------------------------------------------------
 * The admin's small UI kit. It draws only on the shared design tokens
 * (web/src/app/tokens.css): the same semantic utilities — bg-primary,
 * text-text-muted, rounded-md, shadow-sm — as the storefront's components, so
 * both apps look like one product without either copying the other's code.
 * ------------------------------------------------------------------------- */

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
    "disabled:cursor-not-allowed disabled:opacity-60",
    size === "sm" ? "h-9 px-3 text-sm" : "h-11 px-5 text-sm",
    BUTTON_VARIANTS[variant],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  pending?: boolean;
}

export function Button({
  variant,
  size,
  pending = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={buttonClasses({ variant, size, className })}
      {...props}
    >
      {pending ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-e-transparent",
        className,
      )}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-5 shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

const CONTROL =
  "w-full rounded-md border border-border bg-surface px-3 text-sm text-text " +
  "placeholder:text-text-muted/70 focus:border-primary focus:outline-none " +
  "focus:ring-2 focus:ring-primary/25 disabled:bg-card disabled:text-text-muted " +
  "aria-[invalid=true]:border-error aria-[invalid=true]:ring-error/20";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, "h-11", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(CONTROL, "min-h-20 py-2", className)} {...props} />
  );
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(CONTROL, "h-11 pe-8", className)} {...props} />;
}

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-card text-text-muted",
  success: "bg-success/15 text-success-dark",
  warning: "bg-warning/15 text-warning-dark",
  danger: "bg-error/10 text-error-dark",
  info: "bg-info/10 text-info-dark",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** A form-level message: what went wrong that no single field owns. */
export function Alert({
  tone = "danger",
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: "danger" | "info" | "success" }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-4 py-3 text-sm",
        tone === "danger" && "border-error/40 bg-error/5 text-error-dark",
        tone === "info" && "border-info/30 bg-info/5 text-info-dark",
        tone === "success" &&
          "border-success/40 bg-success/10 text-success-dark",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text">{title}</h1>
        {description ? (
          <p className="text-sm text-text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
