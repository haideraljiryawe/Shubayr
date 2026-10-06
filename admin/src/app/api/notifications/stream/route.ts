import { NextResponse, type NextRequest } from "next/server";
import { API_URL } from "@/lib/config";
import { applySession, forward, respond } from "@/lib/session/bff";
import { clientForwardHeaders } from "@/lib/session/forwarding";

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

/**
 * The API sends nothing after its headers until an event or its 15-second
 * heartbeat, and Next writes a streamed response's headers only with the
 * first body chunk — so without this the browser would wait up to 15 s for
 * the stream to open. An SSE comment goes out at once instead, with a
 * reconnect delay for the browser's own retry.
 */
function withOpening(
  upstream: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("retry: 3000\n: open\n\n"));
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

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
          ...clientForwardHeaders(request.headers),
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

  const response = new NextResponse(withOpening(upstream.body), {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform keeps compression middleware from buffering the stream.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
  if (ticket.refreshed) applySession(response, ticket.refreshed);
  return response;
}
