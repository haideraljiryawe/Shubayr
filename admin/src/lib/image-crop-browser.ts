"use client";

import { MAX_UPLOAD_BYTES } from "./product-images";
import { cropRect, outputSize, type CropState, type CropTarget, type Size } from "./image-crop";

/* ---------------------------------------------------------------------------
 * Drawing the crop in the browser. The picture is decoded once (honouring the
 * camera's orientation), then each "use this crop" draws the chosen part at
 * the output size and encodes it: WebP when the browser can, otherwise PNG
 * where transparency must survive (category artwork) or JPEG on white
 * (banners, which fill their card).
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
  context.imageSmoothingQuality = "high";
  context.drawImage(decoded.bitmap, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, size.width, size.height);

  let blob = await canvasBlob(canvas, "image/webp", 0.88);
  if (!blob || blob.type !== "image/webp") {
    if (keepTransparency) {
      blob = await canvasBlob(canvas, "image/png", 1);
    } else {
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, size.width, size.height);
      blob = await canvasBlob(canvas, "image/jpeg", 0.88);
    }
  }
  if (!blob) throw new CropError("encode");
  if (blob.size > MAX_UPLOAD_BYTES) throw new CropError("tooLarge");
  const extension = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
  const base = baseName.replace(/\.[^./\\]+$/, "").replace(/[^\w.-]+/g, "-") || "image";
  return { blob, name: `${base}.${extension}`, size };
}
