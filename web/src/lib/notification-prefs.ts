/* ---------------------------------------------------------------------------
 * Notification preferences.
 *
 * CONTRACT GAP: api/openapi.yaml has no endpoint for per-customer notification
 * settings, so these live on the device. The store is shaped like the other
 * seams (cart, wishlist) — an external store read through useSyncExternalStore
 * rather than an effect copying localStorage into component state — so when the
 * contract grows a GET/PATCH /me/notifications, only this file changes.
 * ------------------------------------------------------------------------- */

export const NOTIFICATION_STORAGE_KEY = "shubayr.notifications.v1";

export const NOTIFICATION_KEYS = ["orders", "offers", "points"] as const;

export type NotificationKey = (typeof NOTIFICATION_KEYS)[number];

export type NotificationPrefs = Record<NotificationKey, boolean>;

/** Order updates matter most, so they start on; marketing starts off. */
export const DEFAULT_PREFS: NotificationPrefs = Object.freeze({
  orders: true,
  offers: false,
  points: true,
});

function parse(raw: string | null): NotificationPrefs {
  try {
    const parsed = JSON.parse(raw ?? "{}") as Partial<Record<string, unknown>>;
    // Key by key: a stored blob missing a key (or carrying a stale one) falls
    // back to the default rather than rendering `undefined` as off.
    return NOTIFICATION_KEYS.reduce<NotificationPrefs>(
      (prefs, key) => ({
        ...prefs,
        [key]:
          typeof parsed[key] === "boolean" ? parsed[key] : DEFAULT_PREFS[key],
      }),
      { ...DEFAULT_PREFS },
    );
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

let state: NotificationPrefs = DEFAULT_PREFS;
let hydrated = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent): void {
  if (event.key !== NOTIFICATION_STORAGE_KEY && event.key !== null) return;
  state = parse(event.newValue);
  emit();
}

export const notificationPrefsStore = {
  subscribe(listener: () => void): () => void {
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
    }
    // The first subscriber is what reads storage: by then React is on the
    // client, so the snapshot below can differ from the server's safely.
    if (!hydrated && typeof window !== "undefined") {
      hydrated = true;
      try {
        state = parse(window.localStorage.getItem(NOTIFICATION_STORAGE_KEY));
      } catch {
        state = { ...DEFAULT_PREFS };
      }
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && typeof window !== "undefined") {
        window.removeEventListener("storage", onStorage);
      }
    };
  },

  getSnapshot(): NotificationPrefs {
    return state;
  },

  /** The server knows no visitor preference, so it renders the defaults. */
  getServerSnapshot(): NotificationPrefs {
    return DEFAULT_PREFS;
  },

  set(key: NotificationKey, value: boolean): void {
    state = { ...state, [key]: value };
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          NOTIFICATION_STORAGE_KEY,
          JSON.stringify(state),
        );
      } catch {
        /* Private mode or a full quota: the toggles still work this session. */
      }
    }
    emit();
  },
};
