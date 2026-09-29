"use client";

import { useSyncExternalStore } from "react";
import type { components } from "@/types/api";

/* ---------------------------------------------------------------------------
 * The staff inbox: unread count and live stream, one store per tab.
 *
 * The stream is this admin's own /api/notifications/stream — same origin,
 * cookie-authenticated — which mints the API's single-use ticket server-side
 * and pipes the events through. The browser therefore never holds a token or
 * a ticket, and the EventSource's built-in reconnect just works: it resends
 * Last-Event-ID and the BFF opens the next API stream with a fresh ticket.
 * Only if the BFF itself refuses (the source ends up CLOSED) does this store
 * open a new source, resuming with `?since=`.
 *
 * Read state is the server's: reads are PATCHed, and notification.read /
 * unread.count come back over every open stream of the same person — other
 * tabs, and their phone, whose inbox this is too. Arrival never reads.
 * ------------------------------------------------------------------------- */

export type InboxNotification = components["schemas"]["Notification"];
export type StreamState = "idle" | "connecting" | "open" | "reconnecting";
export type InboxEvent =
  | { type: "created"; notification: InboxNotification }
  | { type: "read"; ids: string[]; read_at: string };

interface State {
  unread: number | null;
  stream: StreamState;
}

const IDLE: State = Object.freeze({ unread: null, stream: "idle" });
let state: State = IDLE;
const listeners = new Set<() => void>();
const eventListeners = new Set<(event: InboxEvent) => void>();

function set(patch: Partial<State>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function emit(event: InboxEvent): void {
  for (const listener of eventListeners) listener(event);
}

let source: EventSource | null = null;
let lastEventId: string | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;
let running = false;

function parse<T>(event: MessageEvent): T | null {
  try {
    return JSON.parse(event.data as string) as T;
  } catch {
    return null;
  }
}

function remember(event: MessageEvent): void {
  if (event.lastEventId) lastEventId = event.lastEventId;
}

async function refreshCount(): Promise<void> {
  try {
    const response = await fetch("/api/proxy/me/notifications/unread-count", {
      cache: "no-store",
    });
    if (!response.ok) return;
    const body = (await response.json()) as { unread_count: number };
    if (running) set({ unread: body.unread_count });
  } catch {
    /* Keep the last count; the stream corrects it. */
  }
}

function open(): void {
  if (retry) clearTimeout(retry);
  retry = null;
  source?.close();
  if (!running) return;
  set({ stream: state.stream === "idle" ? "connecting" : "reconnecting" });
  const url = lastEventId
    ? `/api/notifications/stream?since=${encodeURIComponent(lastEventId)}`
    : "/api/notifications/stream";
  const next = new EventSource(url);
  source = next;
  next.onopen = () => {
    attempt = 0;
    set({ stream: "open" });
  };
  next.onerror = () => {
    if (source !== next) return;
    if (next.readyState === EventSource.CONNECTING) {
      // The browser is already reconnecting, with Last-Event-ID.
      set({ stream: "reconnecting" });
      return;
    }
    // CLOSED: the BFF refused (signed out, API down). Back off and retry.
    next.close();
    source = null;
    set({ stream: "reconnecting" });
    const delay = Math.min(30_000, 1000 * 2 ** attempt);
    attempt += 1;
    retry = setTimeout(open, delay);
  };
  next.addEventListener("notification.created", (event) => {
    remember(event);
    const notification = parse<InboxNotification>(event);
    if (notification) emit({ type: "created", notification });
  });
  next.addEventListener("notification.read", (event) => {
    remember(event);
    const body = parse<{ notification_ids: string[]; read_at: string }>(event);
    if (body) emit({ type: "read", ids: body.notification_ids, read_at: body.read_at });
  });
  next.addEventListener("unread.count", (event) => {
    remember(event);
    const body = parse<{ unread_count: number }>(event);
    if (body) set({ unread: body.unread_count });
  });
}

function onVisible(): void {
  if (document.visibilityState === "visible" && running) {
    void refreshCount();
    if (!source) open();
  }
}

export const inbox = {
  start(): void {
    if (running) return;
    running = true;
    document.addEventListener("visibilitychange", onVisible);
    void refreshCount();
    open();
  },
  stop(): void {
    running = false;
    document.removeEventListener("visibilitychange", onVisible);
    if (retry) clearTimeout(retry);
    retry = null;
    source?.close();
    source = null;
    state = IDLE;
    for (const listener of listeners) listener();
  },
  onEvent(listener: (event: InboxEvent) => void): () => void {
    eventListeners.add(listener);
    return () => {
      eventListeners.delete(listener);
    };
  },
  /** A read this tab made: show it now, then re-read the count. */
  applyLocalRead(ids: string[], read_at: string): void {
    emit({ type: "read", ids, read_at });
    void refreshCount();
  },
};

export function useInbox(): State {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state,
    () => IDLE,
  );
}

/* --------------------------------------------------------------- requests */

export type NotificationPage = components["schemas"]["NotificationPage"];

async function call<T>(path: string, method = "GET"): Promise<T> {
  const response = await fetch(`/api/proxy${path}`, {
    method,
    cache: "no-store",
    headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`);
  return (await response.json()) as T;
}

export function listNotifications(query: {
  page: number;
  per_page: number;
  unread: boolean;
}): Promise<NotificationPage> {
  const params = new URLSearchParams({
    page: String(query.page),
    per_page: String(query.per_page),
  });
  if (query.unread) params.set("unread", "true");
  return call(`/me/notifications?${params}`);
}

export async function markRead(id: string): Promise<void> {
  const result = await call<{ id: string; read_at: string }>(
    `/me/notifications/${encodeURIComponent(id)}/read`,
    "PATCH",
  );
  inbox.applyLocalRead([id], result.read_at);
}

export async function markAllRead(ids: string[]): Promise<void> {
  const result = await call<{ read_at: string }>("/me/notifications/read-all", "PATCH");
  inbox.applyLocalRead(ids, result.read_at);
}

/** Merge a live event into a fetched page (as the web store's inbox does). */
export function mergeEvent(
  page: NotificationPage,
  event: InboxEvent,
  { firstPage, perPage }: { firstPage: boolean; perPage: number },
): NotificationPage {
  if (event.type === "read") {
    const ids = new Set(event.ids);
    return {
      ...page,
      data: page.data.map((item) =>
        ids.has(item.id) && !item.read_at ? { ...item, read_at: event.read_at } : item,
      ),
    };
  }
  const incoming = event.notification;
  if (page.data.some((item) => item.id === incoming.id)) return page;
  const newest = page.data[0];
  const isNewer =
    !newest ||
    incoming.created_at > newest.created_at ||
    (incoming.created_at === newest.created_at && incoming.id > newest.id);
  if (!firstPage || !isNewer) return page;
  return {
    ...page,
    total: page.total + 1,
    data: [incoming, ...page.data].slice(0, perPage),
  };
}
