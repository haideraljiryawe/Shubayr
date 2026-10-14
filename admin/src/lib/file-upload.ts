"use client";

import { ApiError, toApiError } from "./api/errors";
import { hardNavigate } from "./hard-navigate";

/* ---------------------------------------------------------------------------
 * Sending one file to an admin BFF route with upload progress, which fetch
 * cannot report — hence XMLHttpRequest. Used for pictures, Excel workbooks
 * and image ZIPs. The browser holds no token: the BFF adds it.
 * ------------------------------------------------------------------------- */

export interface UploadProgress {
  /** 0–99 while the bytes travel, 100 once the answer arrived. */
  onProgress?: (percent: number) => void;
  /** Every byte was sent; the server is working on it now. */
  onUploaded?: () => void;
  signal?: AbortSignal;
}

/** POST `file` as the multipart field "file"; resolves with the JSON answer. */
export function postFile<T>(url: string, file: Blob, name: string, { onProgress, onUploaded, signal }: UploadProgress = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file, name);
    xhr.open("POST", url);
    xhr.responseType = "text";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.upload.onload = () => onUploaded?.();
    xhr.onload = () => {
      let parsed: unknown = null;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        parsed = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(parsed as T);
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
