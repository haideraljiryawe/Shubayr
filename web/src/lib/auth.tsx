"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { api, type User } from "./api";
import { authStore } from "./auth-store";

/* ---------------------------------------------------------------------------
 * Authentication.
 *
 * Phone → POST /auth/request-otp → code → POST /auth/verify-otp → tokens. The
 * token pair and the user live in the session store; this provider is the
 * component-facing view of it and the only thing the UI imports.
 *
 * Session persistence and the refresh-on-401 retry are handled below the
 * provider (auth-store.ts and the client's `withFreshToken`), so a component
 * never has to think about tokens — it asks whether there is a user.
 * ------------------------------------------------------------------------- */

export interface AuthApi {
  user: User | null;
  isAuthenticated: boolean;
  /**
   * False until the stored session has been read. Guards wait on this rather
   * than bouncing a signed-in visitor to the login page for one frame.
   */
  ready: boolean;
  requestOtp: (phone: string) => Promise<void>;
  /** Resolves with the signed-in user; rejects with ApiError(401) on a bad code. */
  verifyOtp: (phone: string, code: string) => Promise<User>;
  logout: () => void;
  /** Update the cached user after a profile edit or a fresh GET /me. */
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { session, hydrated } = useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );

  const requestOtp = useCallback(async (phone: string) => {
    await api.requestOtp(phone);
  }, []);

  const verifyOtp = useCallback(async (phone: string, code: string) => {
    const tokens = await api.verifyOtp(phone, code);
    authStore.signIn({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      user: tokens.user,
    });
    return tokens.user;
  }, []);

  const logout = useCallback(() => {
    // Revoke the refresh token on the server (API 6.0), but never make the
    // visitor wait on it: the local session is dropped immediately either way.
    const refreshToken = authStore.getSession()?.refresh_token;
    if (refreshToken) void api.logout(refreshToken).catch(() => undefined);
    authStore.signOut({ deliberate: true });
  }, []);

  const setUser = useCallback((user: User) => {
    authStore.setUser(user);
  }, []);

  const value = useMemo<AuthApi>(
    () => ({
      user: session?.user ?? null,
      isAuthenticated: session !== null,
      ready: hydrated,
      requestOtp,
      verifyOtp,
      logout,
      setUser,
    }),
    [session, hydrated, requestOtp, verifyOtp, logout, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return value;
}
