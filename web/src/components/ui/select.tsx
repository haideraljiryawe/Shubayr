import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { controlBase, controlError } from "./field";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  placeholder?: string;
}

export function Select({
  invalid = false,
  placeholder,
  className,
  children,
  defaultValue,
  ...props
}: SelectProps) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        defaultValue={placeholder && !defaultValue ? "" : defaultValue}
        className={cn(
          controlBase,
          "h-12 ps-4 pe-11 text-sm appearance-none cursor-pointer",
          invalid && controlError,
          className,
        )}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute inset-y-0 end-0 my-auto me-4 size-4 text-text-muted"
        aria-hidden
      />
    </div>
  );
}
