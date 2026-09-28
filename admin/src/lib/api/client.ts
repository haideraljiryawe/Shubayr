"use client";

import createClient from "openapi-fetch";
import type { paths } from "@/types/api";
import { ApiError, toApiError } from "./errors";
import { hardNavigate } from "@/lib/hard-navigate";

/* ---------------------------------------------------------------------------
 * The typed API client for client components.
 *
 * Same generated types as the server client, but its base URL is this app's
 * own /api/proxy: the request leaves the browser with no token at all, and
 * the route handler attaches it from the httpOnly cookie. A 401 that survives
 * the proxy's refresh means the session is over, so the page goes to sign-in.
 * ------------------------------------------------------------------------- */

export const browserApi = createClient<paths>({ baseUrl: "/api/proxy" });

/** Await a call, returning its data or throwing an ApiError. */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await call;
  } catch {
    throw new ApiError(0, "Network error");
  }
  const { data, error, response } = result;
  if (response.ok) return data as T;
  if (response.status === 401 && typeof window !== "undefined") {
    const next = window.location.pathname + window.location.search;
    hardNavigate(`/login?expired=1&next=${encodeURIComponent(next)}`);
  }
  throw toApiError(response.status, error);
}

/** POST JSON to one of this app's own auth routes. */
export async function postJson<T>(url: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Network error");
  }
  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) throw toApiError(response.status, parsed);
  return parsed as T;
}
