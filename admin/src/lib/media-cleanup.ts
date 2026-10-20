"use client";

import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";

/* ---------------------------------------------------------------------------
 * Orphan uploads (contract 17.7.0).
 *
 * Pictures are uploaded before the form that uses them is saved. When that
 * save fails for good or the form is cancelled, the upload is referenced by
 * nothing; DELETE /media/{id} removes it. The API refuses (409) while any
 * catalog, order, setting or expense record still references the object, so
 * a picture that did get saved somewhere stays protected. Cleanup is
 * best-effort: a refusal, a missing permission or a network failure only
 * leaves the orphan where it was, and never blocks the editor.
 * ------------------------------------------------------------------------- */

const MEDIA_PATH = /\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

/** The media id in a stable URL returned by POST /media/images, or null. */
export function mediaIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url, "http://localhost").pathname.match(MEDIA_PATH)?.[1] ?? null;
  } catch {
    return null;
  }
}

export type DiscardOutcome = "deleted" | "kept" | "failed";

/** Delete one unreferenced upload; "kept" when the API says it is in use (or already gone). */
export async function discardUpload(url: string | null | undefined): Promise<DiscardOutcome> {
  const id = mediaIdFromUrl(url);
  if (!id) return "failed";
  try {
    await unwrap(browserApi.DELETE("/media/{id}", { params: { path: { id } } }));
    return "deleted";
  } catch (cause) {
    if (cause instanceof ApiError && (cause.status === 409 || cause.status === 404)) return "kept";
    return "failed";
  }
}

/** Uploads this session made that the saved record does not keep. */
export function orphanedUploads(uploaded: readonly string[], kept: readonly (string | null | undefined)[]): string[] {
  const keep = new Set(kept.filter(Boolean));
  return [...new Set(uploaded)].filter((url) => !keep.has(url));
}

export async function discardUploads(urls: readonly string[]): Promise<void> {
  for (const url of urls) await discardUpload(url);
}
