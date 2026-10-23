"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useLocale } from "next-intl";
import { localeDirection, type Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";
import { CONTROL } from "./control";

/* ---------------------------------------------------------------------------
 * Select — the one dropdown of the Web Admin (VIS-005).
 *
 * Options are declared the way a native <select> declares them — <option>
 * and <optgroup> children — so call sites read the same as before; the popup
 * itself is Radix Select: themed options with a check mark on the selected
 * one, arrow-key / typeahead / Enter / Escape handling, an accessible
 * listbox, and a popup that aligns to its trigger, flips above it when there
 * is no room below, stays inside the viewport and scrolls long lists inside.
 * The arrow sits on the inline end (left in Arabic) with room on both sides.
 * ------------------------------------------------------------------------- */

/** Radix reserves "" for "no value"; an empty <option value=""> maps to this. */
const EMPTY = "__shubayr_empty__";
const toRadix = (value: string) => (value === "" ? EMPTY : value);
const fromRadix = (value: string) => (value === EMPTY ? "" : value);

interface OptionItem {
  kind: "option";
  value: string;
  label: ReactNode;
  disabled: boolean;
}
interface GroupItem {
  kind: "group";
  label: ReactNode;
  options: OptionItem[];
}

type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean };
type GroupProps = { label?: ReactNode; children?: ReactNode };

/** Flatten <option>/<optgroup> children (through arrays and fragments). */
export function readOptions(children: ReactNode): Array<OptionItem | GroupItem> {
  const items: Array<OptionItem | GroupItem> = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) {
      items.push(...readOptions((child as ReactElement<{ children?: ReactNode }>).props.children));
    } else if (child.type === "option") {
      const props = (child as ReactElement<OptionProps>).props;
      items.push({
        kind: "option",
        value: String(props.value ?? ""),
        label: props.children,
        disabled: Boolean(props.disabled),
      });
    } else if (child.type === "optgroup") {
      const props = (child as ReactElement<GroupProps>).props;
      items.push({
        kind: "group",
        label: props.label,
        options: readOptions(props.children).flatMap((item) =>
          item.kind === "option" ? [item] : item.options,
        ),
      });
    }
  });
  return items;
}

export interface SelectProps {
  /** Controlled value; leave undefined and pass defaultValue for a plain GET form. */
  value?: string | number | null;
  defaultValue?: string | number;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  className?: string;
  placeholder?: ReactNode;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "data-testid"?: string;
  /** Direction of the displayed value (e.g. "ltr" for codes). */
  dir?: "ltr" | "rtl";
}

export function Select({
  value,
  defaultValue,
  onValueChange,
  children,
  disabled,
  required,
  name,
  id,
  className,
  placeholder,
  "data-testid": testId,
  dir: valueDir,
  ...aria
}: SelectProps) {
  const dir = localeDirection[useLocale() as Locale];
  const items = readOptions(children);
  const controlled = value !== undefined;
  const [own, setOwn] = useState(defaultValue === undefined ? "" : String(defaultValue));
  const current = controlled ? (value === null ? "" : String(value)) : own;

  return (
    <SelectPrimitive.Root
      value={toRadix(current)}
      onValueChange={(next) => {
        if (!controlled) setOwn(fromRadix(next));
        onValueChange?.(fromRadix(next));
      }}
      disabled={disabled}
      required={required}
      dir={dir}
    >
      {/* The form value is ours, not Radix's, so an empty option submits "". */}
      {name ? <input type="hidden" name={name} value={current} /> : null}
      <SelectPrimitive.Trigger
        id={id}
        data-testid={testId}
        data-value={current}
        {...aria}
        className={cn(
          CONTROL,
          "flex h-11 cursor-pointer items-center justify-between gap-2 pe-3 text-start",
          "data-[placeholder]:text-text-muted/70 data-[state=open]:border-primary data-[state=open]:ring-3 data-[state=open]:ring-primary/30",
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate" dir={valueDir}>
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-text-muted" aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          dir={dir}
          data-testid={testId ? `${testId}-options` : undefined}
          className={cn(
            // Above dialog overlays (z-50) so a Select inside a dialog opens
            // over it rather than behind it.
            "relative z-[60] min-w-[var(--radix-select-trigger-width)] overflow-hidden",
            "max-h-[min(var(--radix-select-content-available-height),20rem)]",
            "rounded-md border border-border bg-surface text-control text-text shadow-lg",
          )}
        >
          <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-text-muted">
            <ChevronUp className="size-4" aria-hidden />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1">
            {items.map((item, index) =>
              item.kind === "option" ? (
                <SelectOption key={`${item.value}-${index}`} item={item} />
              ) : (
                <SelectPrimitive.Group key={`group-${index}`}>
                  <SelectPrimitive.Label className="px-3 pb-1 pt-2 text-caption font-semibold text-text-muted">
                    {item.label}
                  </SelectPrimitive.Label>
                  {item.options.map((option, inner) => (
                    <SelectOption key={`${option.value}-${inner}`} item={option} />
                  ))}
                </SelectPrimitive.Group>
              ),
            )}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-text-muted">
            <ChevronDown className="size-4" aria-hidden />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function SelectOption({ item }: { item: OptionItem }) {
  return (
    <SelectPrimitive.Item
      value={toRadix(item.value)}
      disabled={item.disabled}
      data-value={item.value}
      className={cn(
        "relative flex min-h-9 cursor-pointer select-none items-center rounded-sm py-2 pe-9 ps-3 outline-none",
        "data-[highlighted]:bg-card data-[state=checked]:font-semibold data-[state=checked]:text-primary-dark",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
      )}
    >
      <SelectPrimitive.ItemText>{item.label}</SelectPrimitive.ItemText>
      <span className="absolute end-3 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4 text-primary-dark" aria-hidden />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}
