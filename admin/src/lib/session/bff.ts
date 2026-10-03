import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_ORIGIN, API_URL, COOKIE_SECURE } from "../config";
import { refreshSession } from "./refresh";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearedCookies,
  needsRefresh,
  sessionCookies,
  type TokenPair,
} from "./tokens";

/* ---------------------------------------------------------------------------
 * The backend-for-frontend core: every route handler under src/app/api goes
 * through here. It is the ONLY code that puts a token on an API request from a
 * browser-initiated call, and the only code that writes the session cookies.
 * ------------------------------------------------------------------------- */

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF defence in depth. SameSite=Strict already keeps the cookies off
 * cross-site requests; on top of that a state-changing call must come from
 * this admin's own origin.
 */
export function isSameOrigin(request: NextRequest): boolean {
  if (!MUTATING.has(request.method)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const expected = ADMIN_ORIGIN ?? request.nextUrl.origin;
  return origin === expected;
}

export function crossOriginRejected(): NextResponse {
  return NextResponse.json(
    {
      status: 403,
      code: "CSRF_ORIGIN_MISMATCH",
      message: "Cross-origin request refused",
      errors: [],
    },
    { status: 403 },
  );
}

export function applySession(response: NextResponse, pair: TokenPair): void {
  for (const [name, value, options] of sessionCookies(pair, COOKIE_SECURE)) {
    response.cookies.set(name, value, options);
  }
}

export function clearSession(response: NextResponse): void {
  for (const [name, value, options] of clearedCookies(COOKIE_SECURE)) {
    response.cookies.set(name, value, options);
  }
}

export interface ForwardInit {
  method: string;
  /** Path under the API base, starting with "/". Includes any query string. */
  path: string;
  body?: string;
  /** Send the bearer token (default true). */
  authenticated?: boolean;
}

export interface Forwarded {
  status: number;
  body: string;
  contentType: string | null;
  /** A pair minted by a refresh during this call, to be written as cookies. */
  refreshed: TokenPair | null;
  /** The session is gone (refresh refused): the cookies must be cleared. */
  signedOut: boolean;
  /** The API's Retry-After on a 429, passed through for the caller. */
  retryAfter: string | null;
}

async function send(
  init: ForwardInit,
  accessToken: string | undefined,
  forwardedFor: string | null,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  // Every staff member reaches the API through this one server. Passing the
  // browser's address on lets the API rate-limit and audit per person once it
  // trusts the proxy hop (see admin/README.md).
  if (forwardedFor) headers["X-Forwarded-For"] = forwardedFor;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.authenticated !== false && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return fetch(`${API_URL}${init.path}`, {
    method: init.method,
    headers,
    body: init.body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

/**
 * Call the API as the signed-in user: refresh first if the access token is
 * about to expire, and once more if the API still answers 401.
 */
export async function forward(
  request: NextRequest,
  init: ForwardInit,
): Promise<Forwarded> {
  const authenticated = init.authenticated !== false;
  let access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  let refreshed: TokenPair | null = null;
  let refreshTried = false;

  const tryRefresh = async (): Promise<boolean> => {
    if (refreshTried || !refresh) return false;
    refreshTried = true;
    refreshed = await refreshSession(refresh);
    if (refreshed) access = refreshed.access_token;
    return refreshed !== null;
  };

  if (authenticated && needsRefresh(access)) await tryRefresh();

  const forwardedFor = request.headers.get("x-forwarded-for");
  let response: Response;
  try {
    response = await send(init, access, forwardedFor);
    if (response.status === 401 && authenticated && (await tryRefresh())) {
      response = await send(init, access, forwardedFor);
    }
  } catch {
    // The API is down or unreachable (refused, DNS, timeout): a declared 503
    // the screens can say plainly, instead of a crashed route handler.
    return {
      status: 503,
      body: JSON.stringify({ status: 503, code: "API_UNAVAILABLE", message: "The API can't be reached", errors: [] }),
      contentType: "application/json",
      refreshed: null,
      signedOut: false,
      retryAfter: null,
    };
  }

  // Signed out means: the API refused us and no refresh could fix it.
  const signedOut =
    authenticated && response.status === 401 && refreshed === null;

  return {
    status: response.status,
    body: response.status === 204 ? "" : await response.text(),
    contentType: response.headers.get("content-type"),
    refreshed,
    signedOut,
    retryAfter: response.headers.get("retry-after"),
  };
}

/** Turn a forwarded result into the route handler's response. */
export function respond(result: Forwarded): NextResponse {
  const response =
    result.status === 204 || result.body === ""
      ? new NextResponse(null, { status: result.status })
      : new NextResponse(result.body, {
          status: result.status,
          headers: {
            "Content-Type": result.contentType ?? "application/json",
            "Cache-Control": "no-store",
          },
        });
  if (result.retryAfter) response.headers.set("Retry-After", result.retryAfter);
  if (result.refreshed) applySession(response, result.refreshed);
  if (result.signedOut) clearSession(response);
  return response;
}
