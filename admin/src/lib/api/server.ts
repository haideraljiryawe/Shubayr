import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import createClient from "openapi-fetch";
import type { paths } from "@/types/api";
import { API_URL } from "../config";
import { ACCESS_COOKIE } from "../session/tokens";
import { ApiError, ERROR_CODES, toApiError } from "./errors";

/* ---------------------------------------------------------------------------
 * The typed API client for server components.
 *
 * Types come from api/openapi.yaml via `npm run gen:api` (openapi-typescript,
 * the same generator as the web store); openapi-fetch turns them into a
 * client whose paths, parameters and bodies are all checked. The token is read
 * from the httpOnly cookie on the server — the proxy has already refreshed it
 * if it was about to expire.
 * ------------------------------------------------------------------------- */

export async function serverApi() {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  return createClient<paths>({
    baseUrl: API_URL,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    fetch: (input) => fetch(input, { cache: "no-store" }),
  });
}

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/**
 * Await an openapi-fetch call and sort the outcome for a page.
 *
 * - 401: the session is gone → the sign-in page.
 * - 403 PASSWORD_CHANGE_REQUIRED → the forced password change.
 * - any other failure (403 PERMISSION_DENIED included) → returned, so the
 *   page renders its own clean state instead of crashing.
 */
export async function load<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<Loaded<T>> {
  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await call;
  } catch {
    return { ok: false, error: new ApiError(503, "API unreachable") };
  }
  const { data, error, response } = result;
  if (response.ok) return { ok: true, data: data as T };

  const apiError = toApiError(response.status, error);
  // Clear the cookies on the way out, or the proxy would see a token that
  // still looks valid and send the visitor straight back here.
  if (response.status === 401) redirect("/api/auth/expired");
  if (apiError.code === ERROR_CODES.passwordChangeRequired) {
    redirect("/change-password");
  }
  return { ok: false, error: apiError };
}
