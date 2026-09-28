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

/**
 * 422 field errors keyed by the form field they belong to.
 *
 * The API reports nested paths (`preset_ids.0`, `items.2.quantity`); a form
 * shows the message next to the top-level control, so the first segment is
 * the key and the first message for a field wins.
 */
export function fieldErrorMap(errors: FieldError[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const error of errors) {
    const field = error.field.split(".")[0] || "_";
    map[field] ??= error.message;
  }
  return map;
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
  | "unknown";

/** One word for what went wrong, which the UI turns into a translated message. */
export function errorKind(error: unknown): ErrorKind {
  if (!(error instanceof ApiError)) return "unknown";
  if (error.code === ERROR_CODES.accountLocked) return "locked";
  if (error.code === ERROR_CODES.passwordChangeRequired)
    return "passwordChange";
  if (error.code === ERROR_CODES.customerPhone) return "customerPhone";
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
    default:
      return "unknown";
  }
}
