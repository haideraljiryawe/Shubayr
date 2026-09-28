import { NextResponse, type NextRequest } from "next/server";
import {
  applySession,
  clearSession,
  crossOriginRejected,
  forward,
  isSameOrigin,
  respond,
} from "@/lib/session/bff";

/**
 * POST /api/auth/login — username + password → httpOnly session cookies.
 *
 * The token pair from POST /admin/auth/login is written straight into cookies
 * and never returned: the browser gets the user profile only. Failures pass
 * through with the API's status and error envelope, so the form can tell a
 * wrong password (401) from a locked account (429 ACCOUNT_LOCKED) from a rate
 * limit (429) from field errors (422).
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return crossOriginRejected();

  const result = await forward(request, {
    method: "POST",
    path: "/admin/auth/login",
    body: await request.text(),
    authenticated: false,
  });
  if (result.status !== 201 && result.status !== 200) return respond(result);

  const { access_token, refresh_token, user } = JSON.parse(result.body) as {
    access_token: string;
    refresh_token: string;
    user: unknown;
  };
  const response = NextResponse.json({ user }, { status: 200 });
  // Start clean: a previous admin's cookies must not survive a new sign-in.
  clearSession(response);
  applySession(response, { access_token, refresh_token });
  return response;
}
