import type { InputHTMLAttributes } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/** CSS-only checkbox: filled green with a white tick when checked. */
export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2.5 cursor-pointer select-none",
        props.disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <span className="relative inline-flex">
        <input
          type="checkbox"
          className={cn(
            "peer size-5 shrink-0 appearance-none rounded-sm bg-surface",
            "border-2 border-border cursor-pointer transition-colors duration-150",
            "checked:bg-primary checked:border-primary",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
            "focus-visible:outline-primary disabled:cursor-not-allowed",
          )}
          {...props}
        />
        <Check
          className={cn(
            "pointer-events-none absolute inset-0 m-auto size-3.5",
            "text-on-primary opacity-0 peer-checked:opacity-100",
          )}
          strokeWidth={3}
          aria-hidden
        />
      </span>
      {label ? <span className="text-sm text-text">{label}</span> : null}
    </label>
  );
}
