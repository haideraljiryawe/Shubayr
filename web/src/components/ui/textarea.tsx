import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { controlBase, controlError } from "./field";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ invalid = false, className, ...props }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(
        controlBase,
        "min-h-28 px-4 py-3 text-sm resize-y",
        invalid && controlError,
        className,
      )}
      {...props}
    />
  );
}
