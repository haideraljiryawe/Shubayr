"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
} from "react";
import { Input } from "@/components/ui";
import {
  displayCaret,
  groupDigits,
  normalizeAmountText,
  rawCaret,
  stripGrouping,
  ungroupPasted,
} from "@/lib/number";

/**
 * The shared amount / quantity field (VIS-007): it shows thousands grouping
 * ("1,250,000") while the form only ever holds the raw text ("1250000").
 *
 * - The caret stays where the person put it while commas appear and vanish.
 * - A typed comma is ignored — the field places the grouping itself.
 * - A paste is accepted when its grouping is real ("1,250,000"); otherwise
 *   ("1,5") the text is kept verbatim so validation can refuse it as
 *   ambiguous instead of the field guessing what it meant.
 * - Arabic-Indic and Persian digits are normalized to Latin as they arrive.
 *
 * Use it for money and quantities only — never for phones, SKUs or codes.
 */
export function AmountInput({
  value,
  onValueChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  /** The raw text: no grouping marks, Latin digits. */
  value: string;
  onValueChange: (raw: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Text pasted with grouping that is not on thousands boundaries is shown as
  // pasted until the person fixes it; the field does not regroup it.
  const [literal, setLiteral] = useState(false);
  const pendingCaret = useRef<number | null>(null);
  const display = literal ? value : groupDigits(value);

  useLayoutEffect(() => {
    const input = ref.current;
    const raw = pendingCaret.current;
    if (!input || raw === null) return;
    pendingCaret.current = null;
    if (document.activeElement !== input) return;
    const position = literal ? raw : displayCaret(display, raw);
    input.setSelectionRange(position, position);
  });

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const native = event.nativeEvent as InputEvent;
    const caret = input.selectionStart ?? input.value.length;

    if (native.inputType === "insertFromPaste" || native.inputType === "insertFromDrop") {
      const ungrouped = ungroupPasted(input.value);
      if (ungrouped === null) {
        setLiteral(true);
        pendingCaret.current = caret;
        onValueChange(normalizeAmountText(input.value));
        return;
      }
      setLiteral(false);
      pendingCaret.current = rawCaret(input.value, caret);
      onValueChange(ungrouped);
      return;
    }

    if (literal) {
      const text = normalizeAmountText(input.value);
      const stillLiteral = /[,،٬]/.test(text);
      setLiteral(stillLiteral);
      pendingCaret.current = stillLiteral ? caret : rawCaret(input.value, caret);
      onValueChange(text);
      return;
    }

    if (native.inputType === "insertText" && native.data && /[,،٬]/.test(native.data)) {
      // A typed grouping mark: the value does not change, so React will not
      // re-render — put the visible text and the caret back ourselves.
      const raw = rawCaret(input.value, caret);
      input.value = display;
      const position = displayCaret(display, raw);
      input.setSelectionRange(position, position);
      return;
    }

    let raw = stripGrouping(input.value);
    let rawPosition = rawCaret(input.value, caret);
    if (raw === value && native.inputType === "deleteContentBackward" && rawPosition > 0) {
      // Backspace over a grouping comma deletes the digit before it.
      raw = raw.slice(0, rawPosition - 1) + raw.slice(rawPosition);
      rawPosition -= 1;
    } else if (raw === value && native.inputType === "deleteContentForward") {
      raw = raw.slice(0, rawPosition) + raw.slice(rawPosition + 1);
    }
    pendingCaret.current = rawPosition;
    onValueChange(raw);
  }

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode={props.inputMode ?? "decimal"}
      dir="ltr"
      autoComplete="off"
      value={display}
      data-raw-value={value}
      onChange={handleChange}
    />
  );
}
