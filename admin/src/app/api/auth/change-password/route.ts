import { NextResponse, type NextRequest } from "next/server";
import {
  applySession,
  crossOriginRejected,
  forward,
  isSameOrigin,
  respond,
} from "@/lib/session/bff";

/**
 * POST /api/auth/change-password — replace the current or temporary password.
 *
 * The API revokes every older session and answers with a fresh pair, which
 * replaces the cookies; the browser again only sees the user.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return crossOriginRejected();

  const result = await forward(request, {
    method: "POST",
    path: "/admin/auth/change-password",
    body: await request.text(),
  });
  if (result.status !== 201 && result.status !== 200) return respond(result);

  const { access_token, refresh_token, user } = JSON.parse(result.body) as {
    access_token: string;
    refresh_token: string;
    user: unknown;
  };
  const response = NextResponse.json({ user }, { status: 200 });
  applySession(response, { access_token, refresh_token });
  return response;
}
