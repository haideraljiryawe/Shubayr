import { NextResponse, type NextRequest } from "next/server";
import { API_URL } from "@/lib/config";
import {
  clearSession,
  crossOriginRejected,
  isSameOrigin,
} from "@/lib/session/bff";
import { clientForwardHeaders } from "@/lib/session/forwarding";
import { REFRESH_COOKIE } from "@/lib/session/tokens";

/**
 * POST /api/auth/logout — revoke the refresh token on the API, then clear the
 * cookies. The revocation is best effort: the browser is signed out even if
 * the API cannot be reached.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return crossOriginRejected();

  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  if (refresh) {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...clientForwardHeaders(request.headers) },
      body: JSON.stringify({ refresh_token: refresh }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    }).catch(() => undefined);
  }

  const response = new NextResponse(null, { status: 204 });
  clearSession(response);
  return response;
}
