import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Page } from "@playwright/test";
import { mockSettings } from "../src/lib/mock-data";

/**
 * A scripted API for the work-page and inbox specs (WORK_TESTS=true).
 *
 * The app runs fully "live" against this server, so what is tested is the
 * real request code: query strings, abort signals, the stream ticket and the
 * EventSource itself. Being a real HTTP server — not page.route — is what
 * lets it hold a request open (to finish an old search after a new one),
 * keep an SSE stream open and push to it, and drop it to force a reconnect.
 */

export const FAKE_PORT = Number(process.env.PLAYWRIGHT_API_PORT ?? 3101);
export const FAKE_API = `http://127.0.0.1:${FAKE_PORT}/api/v1`;

export interface Seen {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: IncomingMessage["headers"];
  body: unknown;
  /** Set when the client went away before an answer was written. */
  aborted: boolean;
  url: string;
}

export interface Reply {
  status?: number;
  body?: unknown;
  /** Resolve before answering — lets a test finish requests out of order. */
  wait?: Promise<void>;
}

type Handler = (seen: Seen) => Reply | undefined | Promise<Reply | undefined>;

interface StreamEvent {
  id: number;
  event: string;
  data: unknown;
}

export class FakeApi {
  readonly seen: Seen[] = [];
  private handlers: Array<{ method: string; pattern: RegExp; handler: Handler }> = [];
  private server: Server | null = null;
  private streams = new Set<ServerResponse>();
  /** Every stream event ever emitted, for replay after `since`. */
  readonly events: StreamEvent[] = [];
  private tickets = new Set<string>();
  readonly issuedTickets: string[] = [];

  on(method: string, pattern: RegExp, handler: Handler): this {
    // Newest registration wins, so a test can override a default.
    this.handlers.unshift({ method, pattern, handler });
    return this;
  }

  reset(): void {
    this.seen.length = 0;
    this.handlers = [];
    this.events.length = 0;
    this.tickets.clear();
    this.issuedTickets.length = 0;
    this.dropStreams();
  }

  requests(method: string, pattern: RegExp): Seen[] {
    return this.seen.filter((seen) => seen.method === method && pattern.test(seen.path));
  }

  get openStreams(): number {
    return this.streams.size;
  }

  /** Record an event and push it to every open stream. */
  emit(event: string, data: unknown): number {
    const id = (this.events.at(-1)?.id ?? 0) + 1;
    const row = { id, event, data };
    this.events.push(row);
    for (const stream of this.streams) this.write(stream, row);
    return id;
  }

  /** Record an event as if it happened while nobody was connected. */
  record(event: string, data: unknown): number {
    const id = (this.events.at(-1)?.id ?? 0) + 1;
    this.events.push({ id, event, data });
    return id;
  }

  /** Cut every open stream, as a network drop or a server restart would. */
  dropStreams(): void {
    for (const stream of this.streams) stream.destroy();
    this.streams.clear();
  }

  async start(): Promise<void> {
    this.server = createServer((request, response) => void this.handle(request, response));
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(FAKE_PORT, "127.0.0.1", resolve);
    });
  }

  async stop(): Promise<void> {
    this.dropStreams();
    this.server?.closeAllConnections();
    await new Promise<void>((resolve) => this.server?.close(() => resolve()) ?? resolve());
    this.server = null;
  }

  private write(stream: ServerResponse, row: StreamEvent): void {
    stream.write(`id: ${row.id}\nevent: ${row.event}\ndata: ${JSON.stringify(row.data)}\n\n`);
  }

  private cors(response: ServerResponse): void {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    this.cors(response);
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    let body: unknown = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = raw;
    }
    const seen: Seen = {
      method: request.method ?? "GET",
      path,
      query: url.searchParams,
      headers: request.headers,
      body,
      aborted: false,
      url: request.url ?? "",
    };
    this.seen.push(seen);
    response.on("close", () => {
      if (!response.writableEnded) seen.aborted = true;
    });

    if (seen.method === "POST" && path === "/notifications/stream-ticket") {
      const ticket = `ticket-${this.issuedTickets.length + 1}-${Math.random().toString(36).slice(2)}`;
      this.tickets.add(ticket);
      this.issuedTickets.push(ticket);
      this.json(response, 201, { ticket, expires_at: new Date(Date.now() + 60_000).toISOString() });
      return;
    }
    if (seen.method === "GET" && path === "/notifications/stream") {
      const ticket = url.searchParams.get("ticket") ?? "";
      // Single use, exactly like the server: a replayed ticket is refused.
      if (!this.tickets.delete(ticket)) {
        this.json(response, 401, { code: "UNAUTHORIZED", message: "Invalid or expired stream ticket" });
        return;
      }
      const since = Number(request.headers["last-event-id"] ?? url.searchParams.get("since") ?? 0);
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      response.write(": connected\n\n");
      for (const row of this.events) if (row.id > since) this.write(response, row);
      this.streams.add(response);
      response.on("close", () => this.streams.delete(response));
      return;
    }

    for (const { method, pattern, handler } of this.handlers) {
      if (method !== seen.method || !pattern.test(path)) continue;
      const reply = await handler(seen);
      if (!reply) continue;
      if (reply.wait) await reply.wait;
      if (response.destroyed) return;
      this.json(response, reply.status ?? 200, reply.body ?? {});
      return;
    }

    if (path === "/settings") {
      this.json(response, 200, mockSettings);
      return;
    }
    this.json(response, 404, { code: "NOT_FOUND", message: `${seen.method} ${path}` });
  }

  private json(response: ServerResponse, status: number, body: unknown): void {
    if (response.destroyed) return;
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  }
}

/** A promise a test resolves by hand. */
export function gate(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

export type Role = "customer" | "delivery_agent" | "order_monitor";

export const USERS: Record<Role, { id: string; name: string; phone: string; role: Role }> = {
  customer: { id: "u-customer", name: "أحمد", phone: "+9647700000006", role: "customer" },
  delivery_agent: { id: "u-agent", name: "مندوب", phone: "+9647700000005", role: "delivery_agent" },
  order_monitor: { id: "u-monitor", name: "مراقب", phone: "+9647700000008", role: "order_monitor" },
};

export const ACCESS_TOKEN = "fake-access-token-never-in-a-url";

/**
 * Start the page already signed in as `role`: the session store reads this
 * key at load, exactly as it would after a real OTP sign-in.
 */
export async function signInAs(page: Page, role: Role): Promise<void> {
  const session = {
    access_token: ACCESS_TOKEN,
    refresh_token: "fake-refresh-token",
    user: USERS[role],
  };
  await page.addInitScript((value) => {
    window.localStorage.setItem("shubayr.session.v1", value);
  }, JSON.stringify(session));
}
