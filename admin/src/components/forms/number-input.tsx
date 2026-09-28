"use client";

import { useState, type InputHTMLAttributes } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui";
import { parseLocalizedNumber, type NumberParseOptions } from "@/lib/number";

/**
 * A number field that accepts Arabic-Indic, Persian and Latin digits and
 * refuses separators whose meaning depends on convention (see lib/number.ts).
 *
 * The text the person typed is kept verbatim — it is never reformatted under
 * their cursor — and `onValueChange` receives the parsed number, or null
 * while the text is empty or invalid. The message for invalid text is shown
 * under the field on blur.
 */
export function NumberInput({
  value,
  onValueChange,
  parse,
  onInvalidChange,
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  value: number | null;
  onValueChange: (value: number | null) => void;
  parse?: NumberParseOptions;
  /** Reports the current parse error (null when valid) to the parent form. */
  onInvalidChange?: (message: string | null) => void;
}) {
  const t = useTranslations("numbers");
  const [text, setText] = useState(value === null ? "" : String(value));
  const [message, setMessage] = useState<string | null>(null);

  function evaluate(next: string, show: boolean) {
    const result = parseLocalizedNumber(next, parse);
    if (result.ok) {
      setMessage(null);
      onInvalidChange?.(null);
      onValueChange(result.value);
    } else {
      const text = t(result.error);
      if (show) setMessage(text);
      onInvalidChange?.(text);
      onValueChange(null);
    }
  }

  return (
    <>
      <Input
        {...props}
        type="text"
        inputMode={parse?.integer ? "numeric" : "decimal"}
        dir="ltr"
        autoComplete="off"
        value={text}
        aria-invalid={message ? true : props["aria-invalid"]}
        onChange={(event) => {
          setText(event.target.value);
          evaluate(event.target.value, false);
        }}
        onBlur={(event) => {
          evaluate(event.target.value, true);
          props.onBlur?.(event);
        }}
      />
      {message ? (
        <span
          role="alert"
          className="text-xs font-semibold text-error-dark"
          data-testid="number-error"
        >
          {message}
        </span>
      ) : null}
    </>
  );
}
