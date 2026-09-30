/**
 * The store's timezone (the contract's Asia/Baghdad; not in /settings yet).
 *
 * Kept in a plain module: exported from a "use client" file, a server
 * component would receive a client reference instead of the string.
 */
export const STORE_TIME_ZONE = "Asia/Baghdad";
