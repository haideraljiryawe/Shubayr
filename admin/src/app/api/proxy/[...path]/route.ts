import { NextResponse, type NextRequest } from "next/server";
import {
  crossOriginRejected,
  forward,
  isSameOrigin,
  respond,
} from "@/lib/session/bff";
import { isProxyablePath } from "@/lib/session/proxy-paths";

/**
 * /api/proxy/<api path> — the browser's only road to the API.
 *
 * Forwards the method, query and JSON body to the API with the session's
 * bearer token attached server-side, refreshing it when needed. Only admin
 * routes are reachable; the auth routes have dedicated handlers because they
 * mint or clear cookies. The API still decides every permission — this proxy
 * adds none and removes none.
 */
async function handle(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!isSameOrigin(request)) return crossOriginRejected();

  const { path } = await params;
  const apiPath = `/${path.map(encodeURIComponent).join("/")}`;
  if (!isProxyablePath(apiPath)) {
    return NextResponse.json(
      { status: 404, code: "NOT_FOUND", message: "Not proxied", errors: [] },
      { status: 404 },
    );
  }

  const body =
    request.method === "GET" || request.method === "DELETE"
      ? undefined
      : await request.text();
  const result = await forward(request, {
    method: request.method,
    path: `${apiPath}${request.nextUrl.search}`,
    body: body === "" ? undefined : body,
  });
  return respond(result);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
