import { api, isLive, type InboxNotification } from "./api";

/* ---------------------------------------------------------------------------
 * Notification center (API 6.1).
 *
 * One store per tab holds the unread count and the live connection; the
 * header bell and the inbox page are views of it. Framework-free, like the
 * session store, so the connection logic can be reasoned about on its own.
 *
 * THE STREAM. The bearer token never goes into a URL: each connection first
 * POSTs /notifications/stream-ticket (token in the header) and opens the
 * EventSource with the single-use ticket it returns. Because the ticket is
 * single-use, the browser's own EventSource auto-reconnect cannot work — it
 * would replay a spent ticket — so every drop closes the source and a fresh
 * ticket opens the next one. Where the old connection stopped is carried in
 * `since`, the contract's query-string form of Last-Event-ID (an EventSource
 * cannot set request headers); the server replays everything after it, so a
 * reconnect loses nothing.
 *
 * READ STATE. The server is the only authority. Reading a notification here
 * PATCHes it; the server then emits `notification.read` and `unread.count` to
 * every open stream of that recipient — other tabs, other devices, the phone —
 * which is how read state stays in step everywhere. Arrival alone never marks
 * anything read.
 * ------------------------------------------------------------------------- */

export type StreamState = "idle" | "connecting" | "open" | "reconnecting";

export type InboxEvent =
  | { type: "created"; notification: InboxNotification }
  | { type: "read"; ids: string[]; read_at: string };

interface CenterState {
  /** Null until the first count has arrived. */
  unread: number | null;
  stream: StreamState;
}

const IDLE: CenterState = Object.freeze({ unread: null, stream: "idle" });

let state: CenterState = IDLE;
const listeners = new Set<() => void>();
const eventListeners = new Set<(event: InboxEvent) => void>();

function setState(patch: Partial<CenterState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function emitEvent(event: InboxEvent): void {
  for (const listener of eventListeners) listener(event);
}

/* ------------------------------------------------------------------ cursor */

/**
 * The last stream event this browser has seen, per user. Kept across reloads
 * so a returning tab resumes where it stopped instead of replaying the whole
 * history; shared by the user's tabs, which is safe because the sequence is
 * per recipient and only ever moves forward.
 */
function cursorKey(userId: string): string {
  return `shubayr.inbox.cursor.${userId}`;
}

function readCursor(userId: string): string | null {
  try {
    const value = window.localStorage.getItem(cursorKey(userId));
    return value && /^\d+$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

function writeCursor(userId: string, id: string): void {
  if (!/^\d+$/.test(id)) return;
  try {
    const current = window.localStorage.getItem(cursorKey(userId));
    if (current && /^\d+$/.test(current) && BigInt(current) >= BigInt(id)) {
      return;
    }
    window.localStorage.setItem(cursorKey(userId), id);
  } catch {
    /* Private mode: the in-memory cursor still covers this tab. */
  }
}

/* -------------------------------------------------------------- connection */

let userId: string | null = null;
let source: EventSource | null = null;
let lastEventId: string | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;
/** Bumped on every (re)start and stop, so a late ticket for an old run is dropped. */
let generation = 0;

function clearRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

function closeSource(): void {
  source?.close();
  source = null;
}

function remember(event: MessageEvent): void {
  if (!event.lastEventId) return;
  lastEventId = event.lastEventId;
  if (userId) writeCursor(userId, event.lastEventId);
}

function parse<T>(event: MessageEvent): T | null {
  try {
    return JSON.parse(event.data as string) as T;
  } catch {
    return null;
  }
}

function scheduleReconnect(): void {
  clearRetry();
  if (!userId) return;
  setState({ stream: "reconnecting" });
  // 1s, 2s, 4s … capped at 30s; reset once a connection opens.
  const delay = Math.min(30_000, 1000 * 2 ** attempt);
  attempt += 1;
  retryTimer = setTimeout(() => void connect(), delay);
}

async function connect(): Promise<void> {
  clearRetry();
  closeSource();
  if (!userId || typeof EventSource === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    // The `online` listener reconnects the moment the network is back.
    setState({ stream: "reconnecting" });
    return;
  }
  const run = generation;
  setState({ stream: state.stream === "idle" ? "connecting" : state.stream });

  let ticket: string;
  try {
    ticket = (await api.createStreamTicket()).ticket;
  } catch {
    if (run === generation) scheduleReconnect();
    return;
  }
  if (run !== generation) return;

  const next = new EventSource(api.notificationStreamUrl(ticket, lastEventId));
  source = next;

  next.onopen = () => {
    attempt = 0;
    setState({ stream: "open" });
  };
  next.onerror = () => {
    // A spent ticket cannot be retried, so never let the browser try: close
    // this source and open a new one behind a fresh ticket.
    if (source !== next) return;
    closeSource();
    scheduleReconnect();
  };
  next.addEventListener("notification.created", (event) => {
    remember(event);
    const notification = parse<InboxNotification>(event);
    if (notification) emitEvent({ type: "created", notification });
  });
  next.addEventListener("notification.read", (event) => {
    remember(event);
    const body = parse<{ notification_ids: string[]; read_at: string }>(event);
    if (body) {
      emitEvent({ type: "read", ids: body.notification_ids, read_at: body.read_at });
    }
  });
  next.addEventListener("unread.count", (event) => {
    remember(event);
    const body = parse<{ unread_count: number }>(event);
    if (body) setState({ unread: body.unread_count });
  });
}

/** Fetch the count from the server — on sign-in and whenever the tab returns. */
async function refreshCount(): Promise<void> {
  const run = generation;
  try {
    const unread = await api.getUnreadCount();
    if (run === generation && userId) setState({ unread });
  } catch {
    /* The bell simply keeps its last value; the stream will correct it. */
  }
}

function onOnline(): void {
  if (!userId) return;
  attempt = 0;
  void refreshCount();
  void connect();
}

function onOffline(): void {
  if (!userId || !source) return;
  closeSource();
  clearRetry();
  setState({ stream: "reconnecting" });
}

function onVisible(): void {
  if (!userId || document.visibilityState !== "visible") return;
  void refreshCount();
  if (!source && isLive("inbox")) {
    attempt = 0;
    void connect();
  }
}

let listening = false;

function listen(on: boolean): void {
  if (typeof window === "undefined" || listening === on) return;
  listening = on;
  const method = on ? "addEventListener" : "removeEventListener";
  window[method]("online", onOnline);
  window[method]("offline", onOffline);
  document[method]("visibilitychange", onVisible);
}

export const notificationCenter = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot(): CenterState {
    return state;
  },

  getServerSnapshot(): CenterState {
    return IDLE;
  },

  /** Inbox pages listen here for arrivals and read changes. */
  onEvent(listener: (event: InboxEvent) => void): () => void {
    eventListeners.add(listener);
    return () => {
      eventListeners.delete(listener);
    };
  },

  /** Start (or switch to) a signed-in user's center. */
  start(nextUserId: string): void {
    if (userId === nextUserId) return;
    this.stop();
    userId = nextUserId;
    generation += 1;
    attempt = 0;
    lastEventId = readCursor(nextUserId);
    listen(true);
    void refreshCount();
    if (isLive("inbox")) void connect();
  },

  /** Sign-out: drop the connection and forget the count. */
  stop(): void {
    generation += 1;
    userId = null;
    lastEventId = null;
    clearRetry();
    closeSource();
    listen(false);
    state = IDLE;
    for (const listener of listeners) listener();
  },

  /**
   * Apply a read this tab performed without waiting for the stream's echo,
   * and re-read the count from the server rather than guessing it — the echo
   * may already have adjusted it, and a guess would count the read twice.
   */
  applyLocalRead(ids: string[], read_at: string): void {
    emitEvent({ type: "read", ids, read_at });
    void refreshCount();
  },

  refreshCount,
};
