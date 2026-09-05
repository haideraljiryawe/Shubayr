import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { controlBase, controlError } from "./field";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** Rendered at the inline-start edge; flips automatically under RTL. */
  startIcon?: ReactNode;
  endIcon?: ReactNode;
}

export function Input({
  invalid = false,
  startIcon,
  endIcon,
  className,
  ...props
}: InputProps) {
  const control = (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        controlBase,
        "h-12 px-4 text-sm",
        startIcon && "ps-11",
        endIcon && "pe-11",
        invalid && controlError,
        className,
      )}
      {...props}
    />
  );

  if (!startIcon && !endIcon) return control;

  return (
    <div className="relative">
      {startIcon ? (
        <span
          className="pointer-events-none absolute inset-y-0 start-0 flex w-11 items-center justify-center text-text-muted"
          aria-hidden
        >
          {startIcon}
        </span>
      ) : null}
      {control}
      {endIcon ? (
        <span className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-text-muted">
          {endIcon}
        </span>
      ) : null}
    </div>
  );
}
