"use client";

import { useState, type InputHTMLAttributes } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui";
import { parseLocalizedDecimal, type NumberParseOptions } from "@/lib/number";

/**
 * NumberInput's sibling for money and rates: the same digits and the same
 * refusal of ambiguous separators, but the parent receives the exact decimal
 * STRING ("1450.25"), never a float, because that is what the API stores.
 * The typed text is kept verbatim; the error shows on blur, or at once when
 * the parent passes `error` (e.g. from a 422 or a submit attempt).
 */
export function DecimalInput({
  value,
  onValueChange,
  parse,
  error,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  /** The initial text; the field is uncontrolled after that. */
  value: string;
  onValueChange: (value: string | null, text: string) => void;
  parse?: NumberParseOptions;
  error?: string | null;
}) {
  const t = useTranslations("numbers");
  const [text, setText] = useState(value);
  const [message, setMessage] = useState<string | null>(null);

  function evaluate(next: string, show: boolean) {
    const result = parseLocalizedDecimal(next, parse);
    if (result.ok) {
      setMessage(null);
      onValueChange(result.value, next);
    } else {
      if (show) setMessage(t(result.error));
      onValueChange(null, next);
    }
  }

  const shown = message ?? error ?? null;
  return (
    <>
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        dir="ltr"
        autoComplete="off"
        value={text}
        aria-invalid={shown ? true : undefined}
        onChange={(event) => {
          setText(event.target.value);
          evaluate(event.target.value, false);
        }}
        onBlur={(event) => {
          evaluate(event.target.value, true);
          props.onBlur?.(event);
        }}
      />
      {shown ? (
        <span role="alert" className="text-xs font-semibold text-error-dark" data-testid="number-error">
          {shown}
        </span>
      ) : null}
    </>
  );
}
