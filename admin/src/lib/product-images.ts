import type { components } from "@/types/api";

/* ---------------------------------------------------------------------------
 * Product images in the editor, kept pure so the rules are unit-tested.
 *
 * - The first image is the main one (the API's `is_primary` is "sort order
 *   0"), so "make main" is a move to the front.
 * - An image is uploaded the moment it is picked (POST /media/images, through
 *   the admin's own /api/media/images); the product only refers to the
 *   returned URL. Saving the product sends the list — on create as `images`,
 *   on update as the minimal `media_operations` (remove, add, move) that turn
 *   the stored order into the one on screen.
 * - Pictures are shrunk in the browser before they are sent: a phone photo
 *   is several megabytes at 4000 px; a catalog image needs 1600.
 * ------------------------------------------------------------------------- */

export type ProductImage = components["schemas"]["ProductImage"];
export type MediaOperation = components["schemas"]["ProductMediaOperation"];
export type MediaObject = components["schemas"]["MediaObject"];

/** What POST /media/images accepts (8 MiB at most). */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** The longest edge an uploaded picture keeps. */
export const MAX_IMAGE_EDGE = 1600;
/** Below this, a picture that already fits is sent as it is. */
export const COMPRESS_ABOVE_BYTES = 600 * 1024;
export const IMAGE_QUALITY = 0.85;
/** A product shows at most this many pictures in the editor. */
export const MAX_PRODUCT_IMAGES = 12;

export type ImagePhase = "processing" | "uploading" | "ready" | "failed";

export type ImageFailure = "type" | "tooLarge" | "upload" | "forbidden" | "decode";

export interface ImageDraft {
  /** Stable React key. */
  key: string;
  /** The stored image's id; absent for one added in this session. */
  imageId?: string;
  /** The stable URL from POST /media/images, once uploaded. */
  url?: string;
  /** What the tile shows: the stored URL, or a local object URL while uploading. */
  preview: string;
  phase: ImagePhase;
  /** 0–100 while uploading. */
  progress: number;
  failure?: ImageFailure;
  /** The prepared file, kept for a retry. */
  file?: Blob;
  name?: string;
}

/** The stored images as editor tiles, in their order. */
export function draftsFromImages(images: readonly ProductImage[] | undefined): ImageDraft[] {
  return [...(images ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((image) => ({
      key: image.id,
      imageId: image.id,
      url: image.url,
      preview: image.url,
      phase: "ready" as const,
      progress: 100,
    }));
}

/** Move one item from `from` to `to`, returning a new list. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return [...list];
  const target = Math.max(0, Math.min(list.length - 1, to));
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

/** "Make main": the chosen tile goes first, the rest keep their order. */
export function makeMain<T extends { key: string }>(list: readonly T[], key: string): T[] {
  const index = list.findIndex((item) => item.key === key);
  return index <= 0 ? [...list] : moveItem(list, index, 0);
}

/**
 * A picture that is already saved with the product (or brand), as opposed to
 * one uploaded in this session: deleting it is a pending change that only the
 * next save applies (VIS-008).
 */
export function isStoredImage(draft: ImageDraft): boolean {
  return draft.phase === "ready" && Boolean(draft.url) && !draft.preview.startsWith("blob:");
}

/** Whether every tile is uploaded, so the product can be saved. */
export function imagesSettled(drafts: readonly ImageDraft[]): "ready" | "busy" | "failed" {
  if (drafts.some((draft) => draft.phase === "processing" || draft.phase === "uploading")) return "busy";
  if (drafts.some((draft) => draft.phase === "failed")) return "failed";
  return "ready";
}

/** The `images` of a new product: uploaded URLs in screen order. */
export function creationImages(drafts: readonly ImageDraft[]): Array<{ url: string }> {
  return drafts.flatMap((draft) => (draft.phase === "ready" && draft.url ? [{ url: draft.url }] : []));
}

/**
 * The media operations that turn the stored images into the drafts' order,
 * applied by the API one after another (exactly as `applyMediaOperations`
 * does): first every removal, then for each final position the image that
 * belongs there — added, or moved in from where it is now. Nothing is sent
 * for an image already in its place, so an untouched list sends nothing.
 */
export function mediaOperations(
  stored: readonly ProductImage[] | undefined,
  drafts: readonly ImageDraft[],
): MediaOperation[] {
  const wanted = drafts.filter((draft) => draft.phase === "ready" && draft.url);
  const keep = new Set(wanted.flatMap((draft) => (draft.imageId ? [draft.imageId] : [])));
  const operations: MediaOperation[] = [];
  // The list as the API will hold it, step by step: ids, or null for an add.
  const current: Array<string | null> = [...(stored ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((image) => image.id);

  for (const id of [...current]) {
    if (id && !keep.has(id)) {
      operations.push({ op: "remove", image_id: id });
      current.splice(current.indexOf(id), 1);
    }
  }

  wanted.forEach((draft, position) => {
    if (!draft.imageId) {
      operations.push({ op: "add", url: draft.url!, position });
      current.splice(position, 0, null);
      return;
    }
    const at = current.indexOf(draft.imageId);
    if (at === position) return;
    operations.push({ op: "move", image_id: draft.imageId, position });
    current.splice(at, 1);
    current.splice(position, 0, draft.imageId);
  });

  return operations;
}

/** Why a picked file cannot be used, before anything is sent. */
export function checkImageFile(file: { type: string; size: number }): ImageFailure | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) return "type";
  // A larger file is shrunk first; only one that stays too big is refused.
  return null;
}

/**
 * The size a picture is drawn at: its longest edge brought down to
 * `maxEdge`, keeping the proportions; never enlarged.
 */
export function fitWithin(width: number, height: number, maxEdge = MAX_IMAGE_EDGE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Whether a picture needs re-encoding at all (too large in pixels or bytes). */
export function needsCompression(width: number, height: number, bytes: number): boolean {
  return Math.max(width, height) > MAX_IMAGE_EDGE || bytes > COMPRESS_ABOVE_BYTES;
}

/** "1.4 MB", "820 KB" — sizes in the upload messages. */
export function formatBytes(bytes: number, locale: string): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(locale)} KB`;
}
