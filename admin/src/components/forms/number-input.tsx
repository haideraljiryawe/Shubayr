"use client";

import { useState, type FocusEvent, type InputHTMLAttributes } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui";
import { AmountInput } from "./amount-input";
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
  grouping = false,
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
  /** Thousands grouping while typing (VIS-007) — for prices, fees, amounts. */
  grouping?: boolean;
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

  const shared = {
    ...props,
    "aria-invalid": message ? true : props["aria-invalid"],
    onBlur: (event: FocusEvent<HTMLInputElement>) => {
      evaluate(text, true);
      props.onBlur?.(event);
    },
  };
  const change = (next: string) => {
    setText(next);
    evaluate(next, false);
  };
  return (
    <>
      {grouping ? (
        <AmountInput
          {...shared}
          inputMode={parse?.integer ? "numeric" : "decimal"}
          value={text}
          onValueChange={change}
        />
      ) : (
        <Input
          {...shared}
          type="text"
          inputMode={parse?.integer ? "numeric" : "decimal"}
          dir="ltr"
          autoComplete="off"
          value={text}
          onChange={(event) => change(event.target.value)}
        />
      )}
      {message ? (
        <span
          role="alert"
          className="text-caption font-semibold text-error-dark"
          data-testid="number-error"
        >
          {message}
        </span>
      ) : null}
    </>
  );
}
