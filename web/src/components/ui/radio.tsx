import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** CSS-only radio: green ring with a green dot when selected. */
export interface RadioProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export function Radio({ label, className, ...props }: RadioProps) {
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
          type="radio"
          className={cn(
            "peer size-5 shrink-0 appearance-none rounded-full bg-surface",
            "border-2 border-border cursor-pointer transition-colors duration-150",
            "checked:border-primary",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
            "focus-visible:outline-primary disabled:cursor-not-allowed",
          )}
          {...props}
        />
        <span
          className={cn(
            "pointer-events-none absolute inset-0 m-auto size-2.5 rounded-full",
            "bg-primary opacity-0 peer-checked:opacity-100",
          )}
          aria-hidden
        />
      </span>
      {label ? <span className="text-sm text-text">{label}</span> : null}
    </label>
  );
}
