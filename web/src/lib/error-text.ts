import { ApiError } from "./api";

/* ---------------------------------------------------------------------------
 * What the shopper reads when something fails (NOTE-012): the API error's
 * documented code, worded in the page's language (messages: apiErrors) —
 * never the API's English message, a stack trace or a token. Unknown codes,
 * transport failures and malformed answers get the caller's fallback (or the
 * generic one).
 * ------------------------------------------------------------------------- */

/** next-intl's `t`, scoped to "apiErrors". */
export interface ApiErrorTranslator {
  (key: string): string;
  has(key: string): boolean;
}

export function apiErrorText(t: ApiErrorTranslator, cause: unknown, fallback?: string): string {
  if (cause instanceof ApiError) {
    if (cause.code && t.has(cause.code)) return t(cause.code);
    if (cause.status === 429) return t("_rateLimited");
    if (cause.status === 0) return t("_network");
  } else if (cause instanceof TypeError) {
    // fetch() failing outright: offline or the API unreachable.
    return t("_network");
  }
  return fallback ?? t("_fallback");
}
