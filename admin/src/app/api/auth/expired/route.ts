import { NextResponse, type NextRequest } from "next/server";
import { clearSession } from "@/lib/session/bff";

/**
 * GET /api/auth/expired — where a page goes when the API answered 401 to a
 * token that still looked valid (deactivated account, revoked session). The
 * cookies are cleared here, which a server component cannot do itself, and
 * the visitor lands on the sign-in page with the path they wanted.
 */
export function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next");
  const url = new URL("/login", request.url);
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    url.searchParams.set("next", next);
  }
  url.searchParams.set("expired", "1");
  const response = NextResponse.redirect(url);
  clearSession(response);
  return response;
}
