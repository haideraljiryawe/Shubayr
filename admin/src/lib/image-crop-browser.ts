"use client";

import { MAX_UPLOAD_BYTES } from "./product-images";
import { cropRect, drawPlacement, outputSize, type CropState, type CropTarget, type Size } from "./image-crop";

/* ---------------------------------------------------------------------------
 * Drawing the crop in the browser. The picture is decoded once (honouring the
 * camera's orientation), then each confirmed crop is drawn at the output size
 * and encoded — the file that is uploaded is exactly what the editor showed,
 * square for products, categories and brands (VIS-021), never a CSS clip.
 *
 * The whole picture is drawn at its place on the canvas, so a zoomed-out crop
 * gets even margins: white where the picture fills a card (products,
 * banners), transparent where transparency must survive (category artwork,
 * logos). WebP when the browser can write it, otherwise PNG for transparency
 * or JPEG on white.
 * ------------------------------------------------------------------------- */

export class CropError extends Error {
  constructor(readonly reason: "decode" | "encode" | "tooLarge") {
    super(reason);
  }
}

export interface Decoded {
  bitmap: ImageBitmap;
  size: Size;
}

export async function decodeImage(file: Blob): Promise<Decoded> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { bitmap, size: { width: bitmap.width, height: bitmap.height } };
  } catch {
    throw new CropError("decode");
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export interface Cropped {
  blob: Blob;
  name: string;
  size: Size;
}

export async function drawCrop(
  decoded: Decoded,
  target: CropTarget,
  state: CropState,
  { keepTransparency, baseName }: { keepTransparency: boolean; baseName: string },
): Promise<Cropped> {
  const rect = cropRect(decoded.size, target.aspect, state);
  const size = outputSize(rect, target);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new CropError("encode");
  if (!keepTransparency) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
  }
  context.imageSmoothingQuality = "high";
  const place = drawPlacement(decoded.size, rect, size);
  context.drawImage(decoded.bitmap, place.dx, place.dy, place.dw, place.dh);

  let blob = await canvasBlob(canvas, "image/webp", 0.88);
  if (!blob || blob.type !== "image/webp") {
    blob = await canvasBlob(canvas, keepTransparency ? "image/png" : "image/jpeg", keepTransparency ? 1 : 0.88);
  }
  if (!blob) throw new CropError("encode");
  if (blob.size > MAX_UPLOAD_BYTES) throw new CropError("tooLarge");
  const extension = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
  const base = baseName.replace(/\.[^./\\]+$/, "").replace(/[^\w.-]+/g, "-") || "image";
  return { blob, name: `${base}.${extension}`, size };
}
