"use client";

import { ApiError, toApiError } from "./api/errors";
import { hardNavigate } from "./hard-navigate";
import {
  IMAGE_QUALITY,
  MAX_UPLOAD_BYTES,
  fitWithin,
  needsCompression,
  type MediaObject,
} from "./product-images";

/* ---------------------------------------------------------------------------
 * Getting a picture from the person's device to the API, in the browser.
 *
 * prepareImage shrinks it first (longest edge 1600 px, WebP — JPEG where the
 * browser cannot write WebP), honouring the camera's orientation, and keeps
 * the original when that is already small enough or the result would not be
 * smaller. uploadImage sends it through the admin's own /api/media/images —
 * the browser holds no token — with upload progress, which fetch cannot
 * report, hence XMLHttpRequest.
 * ------------------------------------------------------------------------- */

export class ImagePrepareError extends Error {
  constructor(readonly reason: "decode" | "tooLarge") {
    super(reason);
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function renamed(name: string, type: string): string {
  const base = name.replace(/\.[^./\\]+$/, "") || "image";
  return `${base}.${type === "image/webp" ? "webp" : type === "image/png" ? "png" : "jpg"}`;
}

export async function prepareImage(file: File): Promise<{ blob: Blob; name: string }> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // A format this browser cannot draw (some AVIF): send it untouched if the
    // API would take it, and let the API judge.
    if (file.size <= MAX_UPLOAD_BYTES) return { blob: file, name: file.name };
    throw new ImagePrepareError("decode");
  }
  try {
    if (!needsCompression(bitmap.width, bitmap.height, file.size)) {
      return { blob: file, name: file.name };
    }
    const size = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return guard(file);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    let blob = await canvasBlob(canvas, "image/webp", IMAGE_QUALITY);
    if (!blob || blob.type !== "image/webp") {
      // No WebP encoder: JPEG has no transparency, so paint on white first.
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, size.width, size.height);
      blob = await canvasBlob(canvas, "image/jpeg", IMAGE_QUALITY);
    }
    if (!blob) return guard(file);
    const fits = Math.max(bitmap.width, bitmap.height) === Math.max(size.width, size.height);
    if (fits && blob.size >= file.size) return guard(file);
    if (blob.size > MAX_UPLOAD_BYTES) throw new ImagePrepareError("tooLarge");
    return { blob, name: renamed(file.name, blob.type) };
  } finally {
    bitmap.close();
  }
}

function guard(file: File): { blob: Blob; name: string } {
  if (file.size > MAX_UPLOAD_BYTES) throw new ImagePrepareError("tooLarge");
  return { blob: file, name: file.name };
}

/** POST one prepared picture; resolves with the stored media object. */
export function uploadImage(
  blob: Blob,
  name: string,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<MediaObject> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", blob, name);
    xhr.open("POST", "/api/media/images");
    xhr.responseType = "text";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => {
      let parsed: unknown = null;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        parsed = null;
      }
      if (xhr.status === 201 || xhr.status === 200) {
        onProgress(100);
        resolve(parsed as MediaObject);
        return;
      }
      if (xhr.status === 401) {
        const next = window.location.pathname + window.location.search;
        hardNavigate(`/login?expired=1&next=${encodeURIComponent(next)}`);
      }
      reject(toApiError(xhr.status, parsed));
    };
    xhr.onerror = () => reject(new ApiError(0, "Network error"));
    xhr.onabort = () => reject(new ApiError(0, "Aborted"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}
