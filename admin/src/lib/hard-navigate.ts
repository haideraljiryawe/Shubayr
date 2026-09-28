/**
 * A full page load, on purpose.
 *
 * Used only where the session itself changes — after sign-in, sign-out, a
 * password change, or when the API reports the session is gone. A soft
 * `router.push` would keep the client router cache, which can still hold
 * server-rendered pages from the previous session; a real load starts from
 * the new cookies with nothing left over.
 */
export function hardNavigate(path: string): void {
  window.location.assign(path);
}
