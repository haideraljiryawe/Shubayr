"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Wand2 } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { generateTemporaryPassword } from "@/lib/password";
import { Field } from "./field";
import { PasswordChecklist } from "./password-checklist";

/**
 * A temporary password for someone else: generate one that meets the policy,
 * reveal it to copy, and see which rules a typed one still misses.
 */
export function TemporaryPasswordField({
  value,
  onChange,
  error,
  name = "password",
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  name?: string;
}) {
  const t = useTranslations("password");
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <Field
        label={t("temporary")}
        error={error}
        hint={t("temporaryHint")}
        name={name}
      >
        <Input
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          dir="ltr"
          value={value}
          data-testid={`input-${name}`}
          onChange={(event) => onChange(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            onChange(generateTemporaryPassword());
            setVisible(true);
          }}
          data-testid={`generate-${name}`}
        >
          <Wand2 className="size-4" aria-hidden />
          {t("generate")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setVisible((shown) => !shown)}
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
          {visible ? t("hide") : t("show")}
        </Button>
      </div>
      <PasswordChecklist value={value} testId={`checklist-${name}`} />
    </div>
  );
}
