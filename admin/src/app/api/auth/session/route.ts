import type { NextRequest } from "next/server";
import { forward, respond } from "@/lib/session/bff";

/**
 * GET /api/auth/session — the signed-in staff member, fresh from GET /me.
 *
 * The sidebar polls this on every navigation and when the window regains
 * focus, so a revoked permission disappears from the menu without a new
 * sign-in. It answers exactly what the API answered (401 when signed out,
 * 403 PASSWORD_CHANGE_REQUIRED while a temporary password is in force).
 */
export async function GET(request: NextRequest) {
  return respond(await forward(request, { method: "GET", path: "/me" }));
}
