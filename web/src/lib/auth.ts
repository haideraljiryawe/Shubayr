"use client";

import { useCallback, useSyncExternalStore } from "react";

/* ---------------------------------------------------------------------------
 * Authentication placeholder.
 *
 * The contract requires an authenticated customer to place an order, but real
 * phone-OTP login (POST /auth/request-otp → POST /auth/verify-otp) belongs to
 * the account phase. This module is the entire surface the checkout depends on:
 * a boolean, a sign-in call and a sign-out. That phase replaces the body —
 * storing real tokens and calling those endpoints — without the checkout
 * components changing at all.
 *
 * The mock session lives in sessionStorage, so it is deliberately forgotten
 * when the tab closes and can never be mistaken for a real credential.
 * ------------------------------------------------------------------------- */

const SESSION_KEY = "shubayr.session.mock.v1";

export interface Session {
  phone: string;
}

let session: Session | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function read(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Session> | null) : null;
    return parsed && typeof parsed.phone === "string"
      ? { phone: parsed.phone }
      : null;
  } catch {
    return null;
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Session | null {
  if (!loaded) {
    session = read();
    loaded = true;
  }
  return session;
}

/** The server renders the signed-out view; hydration adopts the real session. */
function getServerSnapshot(): Session | null {
  return null;
}

export interface SessionApi {
  session: Session | null;
  isAuthenticated: boolean;
  signIn: (phone: string) => void;
  signOut: () => void;
}

export function useSession(): SessionApi {
  const current = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const signIn = useCallback((phone: string) => {
    session = { phone };
    loaded = true;
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      /* Not persisted, but the session still holds for this page. */
    }
    emit();
  }, []);

  const signOut = useCallback(() => {
    session = null;
    loaded = true;
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* Nothing persisted; clearing memory is enough. */
    }
    emit();
  }, []);

  return {
    session: current,
    isAuthenticated: current !== null,
    signIn,
    signOut,
  };
}
