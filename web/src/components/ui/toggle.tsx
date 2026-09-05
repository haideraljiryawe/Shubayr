import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * CSS-only switch — a peer checkbox drives the track and knob, so it works in
 * server components and without JS. The knob slides toward the inline end,
 * which mirrors correctly under RTL.
 */
export interface ToggleProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: string;
}

export function Toggle({ label, className, ...props }: ToggleProps) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2.5 cursor-pointer select-none",
        props.disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <input type="checkbox" className="peer sr-only" {...props} />
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full bg-border",
          "transition-colors duration-200",
          "peer-checked:bg-primary",
          "peer-focus-visible:outline peer-focus-visible:outline-2",
          "peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 start-0.5 size-5 rounded-full bg-surface shadow-sm",
            "transition-transform duration-200",
            "peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5",
          )}
        />
      </span>
      {label ? <span className="text-sm text-text">{label}</span> : null}
    </label>
  );
}
