import type { User } from "./api";
import { api, setTokenProvider } from "./api";

/* ---------------------------------------------------------------------------
 * Session store.
 *
 * Holds the token pair and the signed-in user, and is the single place the API
 * client reads credentials from. Framework-free (no React import) so tokens can
 * be read from anywhere, including the refresh path inside the client itself.
 *
 * WHERE THE TOKENS LIVE — deliberate, and worth revisiting:
 * the contract issues bearer tokens to the client (POST /auth/verify-otp
 * returns them in the body), so they are stored in localStorage and attached
 * per request. That is XSS-exposed in a way an httpOnly cookie is not. The seam
 * for moving to cookies is small on purpose: nothing outside this file and
 * `setTokenProvider` in api.ts touches a raw token, so a cookie-session backend
 * would mean emptying the token fields here and dropping the Authorization
 * header — no component changes. Not built now; the backend has no cookie
 * session to adopt yet.
 * ------------------------------------------------------------------------- */

export const SESSION_STORAGE_KEY = "shubayr.session.v1";

export interface Session {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface SessionState {
  session: Session | null;
  /** False until localStorage has been read; components hold their UI on it. */
  hydrated: boolean;
}

const EMPTY_STATE: SessionState = Object.freeze({
  session: null,
  hydrated: false,
});

let state: SessionState = EMPTY_STATE;
const listeners = new Set<() => void>();

/**
 * Set when the customer signs out on purpose, cleared by whoever reacts first.
 *
 * Losing a session and ending one look identical to a guard — both are "no
 * session now" — but they deserve different destinations: an expired session
 * belongs at the login page, while someone who chose to sign out is on their
 * way home. This flag is the difference.
 */
let deliberateSignOut = false;

export function consumeDeliberateSignOut(): boolean {
  const value = deliberateSignOut;
  deliberateSignOut = false;
  return value;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function persist(session: Session | null): void {
  if (typeof window === "undefined") return;
  try {
    if (session) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    /* Private mode or a full quota: the session still holds for this tab. */
  }
}

function setState(next: SessionState, { save = true } = {}): void {
  state = next;
  if (save) persist(next.session);
  emit();
}

function isSession(value: unknown): value is Session {
  const candidate = value as Partial<Session> | null;
  return (
    !!candidate &&
    typeof candidate.access_token === "string" &&
    typeof candidate.refresh_token === "string" &&
    typeof candidate.user === "object" &&
    candidate.user !== null
  );
}

function readStorage(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export const authStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot(): SessionState {
    return state;
  },

  /**
   * The server renders every page signed out — it has no access to the token —
   * so this is what the hydration pass sees. The stored session is adopted in
   * the same commit, which is why the header never flashes «تسجيل الدخول» at a
   * signed-in visitor.
   */
  getServerSnapshot(): SessionState {
    return EMPTY_STATE;
  },

  getSession(): Session | null {
    return state.session;
  },

  signIn(session: Session): void {
    setState({ session, hydrated: true });
  },

  /** `deliberate` marks a sign-out the customer asked for, not an expiry. */
  signOut({ deliberate = false } = {}): void {
    deliberateSignOut = deliberate;
    setState({ session: null, hydrated: true });
  },

  /** Replace the user without touching the tokens (profile edits, GET /me). */
  setUser(user: User): void {
    if (!state.session) return;
    setState({ ...state, session: { ...state.session, user } });
  },

  /** Store a refreshed pair, keeping the user we already have. */
  setTokens(tokens: { access_token: string; refresh_token: string }): void {
    if (!state.session) return;
    setState({ ...state, session: { ...state.session, ...tokens } });
  },
};

/**
 * Hand the API client its credentials. Registering rather than importing keeps
 * the dependency one-directional — the store knows the client, never the
 * reverse — which is what lets the client refresh tokens without a cycle.
 */
setTokenProvider({
  getAccessToken: () => state.session?.access_token ?? null,
  getRefreshToken: () => state.session?.refresh_token ?? null,
  onTokens: (tokens) => authStore.setTokens(tokens),
  onSignedOut: () => authStore.signOut(),
  onWorkAccountForbidden: () => void reloadUser(),
});

/**
 * Re-read the signed-in user after the API refused a purchase function as a
 * work account. The role on the fresh profile is authoritative, and adopting
 * it is what flips the storefront to the work-account landing. One reload is
 * shared by however many requests were refused at once.
 */
let reloading: Promise<void> | null = null;

function reloadUser(): Promise<void> {
  reloading ??= api
    .getMe()
    .then((user) => authStore.setUser(user))
    .catch(() => {
      /* The refusal already reached its caller; nothing more to do here. */
    })
    .finally(() => {
      reloading = null;
    });
  return reloading;
}

if (typeof window !== "undefined") {
  // Runs when the client bundle loads — before React hydrates — so the first
  // post-hydration render already knows who is signed in.
  setState({ session: readStorage(), hydrated: true }, { save: false });

  // Signing out in one tab signs out the others.
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== SESSION_STORAGE_KEY) return;
    setState({ session: readStorage(), hydrated: true }, { save: false });
  });
}
