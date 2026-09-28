"use client";

import { useCallback, useState } from "react";
import {
  ApiError,
  errorKind,
  fieldErrorMap,
  type ErrorKind,
} from "@/lib/api/errors";

export interface ApiFormState {
  pending: boolean;
  /** 422 messages keyed by top-level field name. */
  fieldErrors: Record<string, string>;
  /** What went wrong at the form level, if anything. */
  formError: ErrorKind | null;
  /** The API's own message for the form-level error, as a fallback detail. */
  formErrorDetail: string | null;
}

/**
 * Submit a form to the API and keep what the person typed.
 *
 * The values live in the form's own state and are never reset on failure; a
 * 422 is spread onto the fields it names, and anything else (403, 409, 429,
 * a network error) becomes one form-level message. `run` resolves to the
 * result on success and to `undefined` on failure, so callers only branch on
 * success.
 */
export function useApiForm() {
  const [state, setState] = useState<ApiFormState>({
    pending: false,
    fieldErrors: {},
    formError: null,
    formErrorDetail: null,
  });

  const run = useCallback(
    async <T>(action: () => Promise<T>): Promise<T | undefined> => {
      setState({
        pending: true,
        fieldErrors: {},
        formError: null,
        formErrorDetail: null,
      });
      try {
        const result = await action();
        setState((current) => ({ ...current, pending: false }));
        return result;
      } catch (cause) {
        const kind = errorKind(cause);
        const fieldErrors =
          cause instanceof ApiError && kind === "validation"
            ? fieldErrorMap(cause.errors)
            : {};
        setState({
          pending: false,
          fieldErrors,
          // A 422 whose errors all landed on fields needs no banner.
          formError:
            kind === "validation" && Object.keys(fieldErrors).length > 0
              ? null
              : kind,
          formErrorDetail: cause instanceof ApiError ? cause.message : null,
        });
        return undefined;
      }
    },
    [],
  );

  /** Clear one field's error as soon as the person edits it. */
  const clearField = useCallback((name: string) => {
    setState((current) => {
      if (!(name in current.fieldErrors)) return current;
      const rest = { ...current.fieldErrors };
      delete rest[name];
      return { ...current, fieldErrors: rest };
    });
  }, []);

  /** Show a client-side validation message the same way as the API's. */
  const setFieldErrors = useCallback((fieldErrors: Record<string, string>) => {
    setState((current) => ({ ...current, fieldErrors }));
  }, []);

  return { ...state, run, clearField, setFieldErrors };
}
