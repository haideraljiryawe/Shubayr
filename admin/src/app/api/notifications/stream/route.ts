import { NextResponse, type NextRequest } from "next/server";
import { API_URL } from "@/lib/config";
import { applySession, forward, respond } from "@/lib/session/bff";

/**
 * GET /api/notifications/stream — the staff inbox's live stream, proxied.
 *
 * The browser opens a same-origin EventSource here and holds nothing: this
 * handler mints the single-use stream ticket with the session's bearer token
 * (refreshing it first if needed), opens the API's stream with it, and pipes
 * the events back unchanged — ids included, so the browser's own
 * auto-reconnect sends Last-Event-ID, and every reconnect lands here again
 * for a fresh ticket. A manual reconnect passes `?since=` instead.
 */

export const dynamic = "force-dynamic";

function resumePoint(request: NextRequest): string | null {
  const value =
    request.headers.get("last-event-id") ??
    request.nextUrl.searchParams.get("since");
  return value && /^\d{1,19}$/.test(value) ? value : null;
}

export async function GET(request: NextRequest) {
  const ticket = await forward(request, {
    method: "POST",
    path: "/notifications/stream-ticket",
  });
  if (ticket.status !== 201) return respond(ticket);

  let value: string;
  try {
    value = (JSON.parse(ticket.body) as { ticket: string }).ticket;
  } catch {
    return NextResponse.json(
      { status: 502, code: "BAD_GATEWAY", message: "No stream ticket", errors: [] },
      { status: 502 },
    );
  }

  const since = resumePoint(request);
  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_URL}/notifications/stream?ticket=${encodeURIComponent(value)}`,
      {
        headers: {
          Accept: "text/event-stream",
          ...(since ? { "Last-Event-ID": since } : {}),
        },
        cache: "no-store",
        // The browser going away closes the API's stream too.
        signal: request.signal,
      },
    );
  } catch {
    return new NextResponse(null, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new NextResponse(null, { status: upstream.status || 502 });
  }

  const response = new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Never buffered by a reverse proxy, never compressed in one lump.
      "X-Accel-Buffering": "no",
      "Content-Encoding": "none",
    },
  });
  if (ticket.refreshed) applySession(response, ticket.refreshed);
  return response;
}
