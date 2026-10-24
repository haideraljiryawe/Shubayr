"use client";

import { useState, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * A password input with a show/hide button at its end (VIS-001). It is one
 * control as far as `Field` is concerned: the label, `aria-invalid` and the
 * error's description land on the input itself, not on the wrapper.
 */
export function PasswordInput({
  className,
  toggleTestId,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { toggleTestId?: string }) {
  const t = useTranslations("auth");
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className={cn("pe-12", className)} />
      <button
        type="button"
        onClick={() => setShown((value) => !value)}
        aria-label={shown ? t("hidePassword") : t("showPassword")}
        aria-pressed={shown}
        data-testid={toggleTestId}
        className="absolute inset-y-0 end-0 inline-flex w-11 cursor-pointer items-center justify-center rounded-e-md text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-primary/40"
      >
        {shown ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
      </button>
    </div>
  );
}
