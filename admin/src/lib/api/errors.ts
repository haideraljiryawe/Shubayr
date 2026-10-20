import type { components } from "@/types/api";

/* ---------------------------------------------------------------------------
 * The API's unified Error envelope, and what the admin does with it.
 * Pure — shared by the browser client, server components and unit tests.
 * ------------------------------------------------------------------------- */

export type ApiErrorBody = components["schemas"]["Error"];
export type FieldError = components["schemas"]["FieldError"];

/** Codes the admin routes on. Anything else falls back to the status. */
export const ERROR_CODES = {
  accountLocked: "ACCOUNT_LOCKED",
  passwordChangeRequired: "PASSWORD_CHANGE_REQUIRED",
  permissionDenied: "PERMISSION_DENIED",
  surfaceForbidden: "AUTH_SURFACE_FORBIDDEN",
  customerPhone: "CUSTOMER_PHONE_ALREADY_REGISTERED",
  validation: "VALIDATION_FAILED",
} as const;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly errors: FieldError[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Build an ApiError from whatever a failed response carried. */
export function toApiError(status: number, body: unknown): ApiError {
  const envelope = (body ?? {}) as Partial<ApiErrorBody>;
  return new ApiError(
    status,
    typeof envelope.message === "string"
      ? envelope.message
      : `Request failed with ${status}`,
    typeof envelope.code === "string" ? envelope.code : undefined,
    Array.isArray(envelope.errors) ? envelope.errors : [],
  );
}

/* ---------------------------------------------------------------------------
 * Messages people see (NOTE-012): by code, in the person's language — never
 * the API's English message text, which is for logs and developers.
 *
 * - A top-level code (PERIOD_CLOSED, …) has its own message in errors.codes
 *   when the contract documents it; otherwise the error's kind speaks.
 * - A field error's code is a validator name (isNotEmpty, maxLength, …) or a
 *   documented business code; both map to a message, and anything else gets
 *   the field fallback "Check this value".
 * ------------------------------------------------------------------------- */

/** The translator the describers need (next-intl's `t`, scoped to "errors"). */
export interface ErrorTranslator {
  (key: string): string;
  has(key: string): boolean;
}

/** class-validator constraint names → errors.fields keys. */
export const FIELD_CODE_MESSAGES: Record<string, string> = {
  isNotEmpty: "required",
  isDefined: "required",
  arrayNotEmpty: "required",
  maxLength: "tooLong",
  arrayMaxSize: "tooLong",
  minLength: "tooShort",
  arrayMinSize: "tooShort",
  isLength: "tooLong",
  isNumber: "number",
  isNumberString: "number",
  isDecimal: "number",
  isNumeric: "number",
  isInt: "wholeNumber",
  min: "tooSmall",
  isPositive: "tooSmall",
  max: "tooLarge",
  isEnum: "choice",
  isIn: "choice",
  isEmail: "email",
  isUrl: "url",
  isDateString: "date",
  isISO8601: "date",
  isDate: "date",
  matches: "format",
  isUUID: "format",
  isObject: "format",
  isArray: "format",
  nestedValidation: "format",
  whitelistValidation: "notAllowed",
  arrayUnique: "duplicate",
  isPhoneNumber: "phone",
  isMobilePhone: "phone",
  isString: "text",
  isBoolean: "yesNo",
};

/** The message for one field error, in the person's language. */
export function describeFieldError(t: ErrorTranslator, error: Pick<FieldError, "code">): string {
  const field = FIELD_CODE_MESSAGES[error.code];
  if (field) return t(`fields.${field}`);
  if (t.has(`codes.${error.code}`)) return t(`codes.${error.code}`);
  return t("fields.invalid");
}

/**
 * 422 field errors keyed by the form field they belong to, as messages in
 * the person's language.
 *
 * The API reports nested paths (`preset_ids.0`, `items.2.quantity`); a form
 * shows the message next to the top-level control, so the first segment is
 * the key and the first error for a field wins.
 */
export function fieldErrorMap(errors: FieldError[], t: ErrorTranslator): Record<string, string> {
  const map: Record<string, string> = {};
  for (const error of errors) {
    const field = error.field.split(".")[0] || "_";
    map[field] ??= describeFieldError(t, error);
  }
  return map;
}

/** The API error's code, when there is one (for FormError's `code`). */
export function errorCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined;
}

/**
 * The one message for a failure: its documented code's message if there is
 * one, else the kind's. Never the server's own text, a stack or a token.
 */
export function describeError(t: ErrorTranslator, error: unknown): string {
  const code = errorCode(error);
  if (code && t.has(`codes.${code}`)) return t(`codes.${code}`);
  return t(errorKind(error));
}

export type ErrorKind =
  | "validation"
  | "forbidden"
  | "passwordChange"
  | "unauthorized"
  | "locked"
  | "rateLimited"
  | "notFound"
  | "conflict"
  | "customerPhone"
  /** The API can't be reached (the BFF's 503 API_UNAVAILABLE, or a 502/504). */
  | "unavailable"
  | "unknown";

/** One word for what went wrong, which the UI turns into a translated message. */
export function errorKind(error: unknown): ErrorKind {
  if (!(error instanceof ApiError)) return "unknown";
  if (error.code === ERROR_CODES.accountLocked) return "locked";
  if (error.code === ERROR_CODES.passwordChangeRequired)
    return "passwordChange";
  if (error.code === ERROR_CODES.customerPhone) return "customerPhone";
  if (error.code === "API_UNAVAILABLE") return "unavailable";
  switch (error.status) {
    case 422:
      return "validation";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "notFound";
    case 409:
      return "conflict";
    case 429:
      return "rateLimited";
    case 502:
    case 503:
    case 504:
      return "unavailable";
    default:
      return "unknown";
  }
}
