"use client";

import { useCallback, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ApiError,
  errorKind,
  fieldErrorMap,
  type ErrorKind,
  type FieldError,
} from "@/lib/api/errors";

export interface ApiFormState {
  pending: boolean;
  /** 422 messages keyed by top-level field name, in the current language. */
  fieldErrors: Record<string, string>;
  /** What went wrong at the form level, if anything. */
  formError: ErrorKind | null;
  /** The failure's documented code, for FormError's specific message. */
  formErrorCode: string | null;
  /** What the last submit failed with, even when it all landed on fields. */
  failure: ErrorKind | null;
}

interface Stored {
  pending: boolean;
  /** The API's field errors, kept as codes and translated at render time. */
  apiFieldErrors: FieldError[];
  /** Client-side messages a form set itself (already in a language). */
  clientFieldErrors: Record<string, string>;
  /** Fields the person has edited since the errors arrived. */
  cleared: string[];
  formError: ErrorKind | null;
  formErrorCode: string | null;
  failure: ErrorKind | null;
  /** The language the client messages were written in. */
  locale: string;
}

/**
 * Submit a form to the API and keep what the person typed.
 *
 * The values live in the form's own state and are never reset on failure; a
 * 422 is spread onto the fields it names, and anything else (403, 409, 429,
 * a network error) becomes one form-level message. `run` resolves to the
 * result on success and to `undefined` on failure, so callers only branch on
 * success.
 *
 * Messages are never the API's English text (NOTE-012): field errors and the
 * form-level code are kept as codes and translated when shown, so switching
 * the language re-words them; messages a form set itself are cleared on a
 * switch rather than left in the old language.
 */
export function useApiForm() {
  const t = useTranslations("errors");
  const locale = useLocale();
  const [state, setState] = useState<Stored>({
    pending: false,
    apiFieldErrors: [],
    clientFieldErrors: {},
    cleared: [],
    formError: null,
    formErrorCode: null,
    failure: null,
    locale,
  });

  const run = useCallback(
    async <T>(action: () => Promise<T>): Promise<T | undefined> => {
      setState({
        pending: true,
        apiFieldErrors: [],
        clientFieldErrors: {},
        cleared: [],
        formError: null,
        formErrorCode: null,
        failure: null,
        locale,
      });
      try {
        const result = await action();
        setState((current) => ({ ...current, pending: false }));
        return result;
      } catch (cause) {
        const kind = errorKind(cause);
        const apiFieldErrors = cause instanceof ApiError && kind === "validation" ? cause.errors : [];
        setState({
          pending: false,
          apiFieldErrors,
          clientFieldErrors: {},
          cleared: [],
          // A 422 whose errors all landed on fields needs no banner.
          formError: kind === "validation" && apiFieldErrors.length > 0 ? null : kind,
          formErrorCode: cause instanceof ApiError ? (cause.code ?? null) : null,
          failure: kind,
          locale,
        });
        return undefined;
      }
    },
    [locale],
  );

  /** Clear one field's error as soon as the person edits it. */
  const clearField = useCallback((name: string) => {
    setState((current) => {
      if (current.cleared.includes(name)) return current;
      const client = { ...current.clientFieldErrors };
      delete client[name];
      return { ...current, clientFieldErrors: client, cleared: [...current.cleared, name] };
    });
  }, []);

  /** Show a client-side validation message the same way as the API's. */
  const setFieldErrors = useCallback(
    (fieldErrors: Record<string, string>) => {
      setState((current) => ({ ...current, clientFieldErrors: fieldErrors, cleared: [], locale }));
    },
    [locale],
  );

  const client = state.locale === locale ? state.clientFieldErrors : {};
  const fieldErrors: Record<string, string> = {};
  for (const [name, message] of Object.entries({ ...fieldErrorMap(state.apiFieldErrors, t), ...client })) {
    if (!state.cleared.includes(name)) fieldErrors[name] = message;
  }

  const view: ApiFormState = {
    pending: state.pending,
    fieldErrors,
    formError: state.formError,
    formErrorCode: state.formErrorCode,
    failure: state.failure,
  };
  return { ...view, run, clearField, setFieldErrors };
}
