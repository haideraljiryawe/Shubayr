"use client";

import {
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * Label + control + error, wired for assistive tech.
 *
 * The child control gets its `id`, `aria-invalid` and `aria-describedby`
 * from here, so a 422 message from the API lands right under the field it
 * names and is announced with it — and the control keeps whatever the person
 * typed, because the form owns the values, not the error.
 */
export function Field({
  label,
  error,
  hint,
  children,
  name,
}: {
  label: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  name?: string;
  children: ReactElement<Record<string, unknown>>;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })
    : children;

  return (
    <div className="flex flex-col gap-1.5" data-field={name}>
      <label htmlFor={id} className="text-sm font-semibold text-text">
        {label}
      </label>
      {control}
      {hint ? (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          className="text-xs font-semibold text-error-dark"
          data-testid={name ? `error-${name}` : undefined}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
