"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "./auth";
import { notificationCenter } from "./notification-center";

/** The unread count (null until known) and the live connection's state. */
export function useNotificationCenter() {
  return useSyncExternalStore(
    notificationCenter.subscribe,
    notificationCenter.getSnapshot,
    notificationCenter.getServerSnapshot,
  );
}

/**
 * Renders nothing. Starts the signed-in user's notification center — every
 * role, customers included — and stops it on sign-out, so the stream never
 * outlives the session that opened it.
 */
export function NotificationCenterSync() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (userId) notificationCenter.start(userId);
    else notificationCenter.stop();
  }, [userId]);

  useEffect(() => () => notificationCenter.stop(), []);

  return null;
}

/**
 * Where tapping a notification goes on the web store.
 *
 * The server writes one deep link per recipient role (the same links the phone
 * app follows). The store serves the monitor's and the agent's links at the
 * same paths; a customer's order lives under /account. Anything else — or
 * anything that is not a plain same-site path — opens the inbox.
 */
export function inboxHref(deepLink: string): string {
  if (!/^\/[A-Za-z0-9/_-]*$/.test(deepLink)) return "/notifications";
  if (/^\/monitor\/orders\/[^/]+$/.test(deepLink)) return deepLink;
  if (/^\/deliveries\/[^/]+$/.test(deepLink)) return deepLink;
  const order = /^\/orders\/([^/]+)$/.exec(deepLink);
  if (order) return `/account/orders/${order[1]}`;
  return "/notifications";
}
