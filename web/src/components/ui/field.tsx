import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Label + control + error wrapper. Errors render with the red border and the
 * trailing alert dot from the sheet's «حقل به خطأ».
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="text-sm font-medium text-text ps-0.5"
        >
          {label}
        </label>
      ) : null}

      {children}

      {error ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-error ps-0.5">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-text-muted ps-0.5">{hint}</p>
      ) : null}
    </div>
  );
}

/** Shared shell styling for input/select/textarea so they stay identical. */
export const controlBase = cn(
  "w-full bg-surface text-text placeholder:text-text-muted",
  "border rounded-md transition-colors duration-150",
  "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
  "disabled:bg-card disabled:text-text-muted disabled:cursor-not-allowed",
);

export const controlError = "border-error focus:border-error focus:ring-error/20";
