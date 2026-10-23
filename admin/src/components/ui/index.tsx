import type {
  ButtonHTMLAttributes,
  ComponentProps,
  HTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { CONTROL } from "./control";
import { buttonClasses, type ButtonVariant } from "./button-classes";

export { buttonClasses, type ButtonVariant } from "./button-classes";

export { CONTROL } from "./control";
export { Select, type SelectProps } from "./select";
export { Dialog, DialogShell, type DialogShellProps } from "./dialog";
export { FilePicker } from "./file-picker";
export { ActionBar } from "./action-bar";
export { TabStrip, TabLink } from "./tab-strip";

/* ---------------------------------------------------------------------------
 * The admin's small UI kit. It draws only on the shared design tokens
 * (web/src/app/tokens.css for colour, admin/src/app/globals.css for the type
 * scale): the same semantic utilities — bg-primary, text-text-muted,
 * border-field, text-body — everywhere, so equivalent controls look the same
 * on every page and a token change reaches all of them (VIS-018). Pages
 * compose these primitives; they do not restyle them.
 * ------------------------------------------------------------------------- */

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
        "rounded-lg border border-border bg-surface p-5 text-body shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(CONTROL, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea className={cn(CONTROL, "min-h-20 py-2", className)} {...props} />
  );
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
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-badge whitespace-nowrap",
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
        "rounded-md border px-4 py-3 text-body",
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
        <h1 className="text-page-title text-text">{title}</h1>
        {description ? (
          <p className="text-body text-text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
