/* ---------------------------------------------------------------------------
 * Crop geometry for the image editors (category squares, 2:1 banners), kept
 * pure so the rules are unit-tested; drawing lives in image-crop-browser.ts.
 *
 * The crop is always the frame's aspect ratio. At zoom 1 it is the largest
 * such rectangle the picture holds; zooming in shrinks it around the same
 * point. `x`/`y` (0–1) place it along the room left on each axis — 0.5 is
 * centred. The output keeps the aspect exactly and is never enlarged: a crop
 * smaller than the target size is sent at its own size (and flagged).
 * ------------------------------------------------------------------------- */

export interface Size {
  width: number;
  height: number;
}

export interface CropState {
  zoom: number;
  x: number;
  y: number;
}

export interface CropTarget {
  /** width ÷ height of the frame and of the output. */
  aspect: number;
  /** The width the output aims for. */
  width: number;
  /** Below this output width the editor warns about sharpness. */
  minWidth: number;
}

/** NOTE-006: a 1:1 master around 1024 × 1024. */
export const CATEGORY_CROP: CropTarget = { aspect: 1, width: 1024, minWidth: 512 };
/** NOTE-001: a shared 2:1 composition, starting at 1600 × 800. */
export const BANNER_CROP: CropTarget = { aspect: 2, width: 1600, minWidth: 1200 };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const CENTRED: CropState = { zoom: 1, x: 0.5, y: 0.5 };

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function clampCrop(state: CropState): CropState {
  return {
    zoom: clamp(Number.isFinite(state.zoom) ? state.zoom : 1, MIN_ZOOM, MAX_ZOOM),
    x: clamp(Number.isFinite(state.x) ? state.x : 0.5, 0, 1),
    y: clamp(Number.isFinite(state.y) ? state.y : 0.5, 0, 1),
  };
}

/** The part of the source picture the crop takes, in source pixels. */
export function cropRect(source: Size, aspect: number, state: CropState): CropRect {
  const { zoom, x, y } = clampCrop(state);
  // The largest rectangle of this aspect that fits, then zoomed in.
  const fitsWide = source.width / source.height > aspect;
  const baseHeight = fitsWide ? source.height : source.width / aspect;
  const sh = baseHeight / zoom;
  const sw = sh * aspect;
  return { sx: (source.width - sw) * x, sy: (source.height - sh) * y, sw, sh };
}

/** The output picture's size: the target width, or the crop's own if smaller — never enlarged. */
export function outputSize(rect: CropRect, target: CropTarget): Size {
  const width = Math.max(1, Math.min(target.width, Math.floor(rect.sw)));
  return { width, height: Math.max(1, Math.round(width / target.aspect)) };
}

/** Too few source pixels for a sharp result at the target size. */
export function isLowResolution(rect: CropRect, target: CropTarget): boolean {
  return rect.sw < target.minWidth;
}

/**
 * Drag the picture by (dx, dy) screen pixels inside a frame `frameWidth` wide:
 * the picture follows the pointer, so the crop moves the other way.
 */
export function panCrop(source: Size, aspect: number, state: CropState, dx: number, dy: number, frameWidth: number): CropState {
  const rect = cropRect(source, aspect, state);
  if (frameWidth <= 0) return state;
  const scale = rect.sw / frameWidth;
  const roomX = source.width - rect.sw;
  const roomY = source.height - rect.sh;
  return clampCrop({
    zoom: state.zoom,
    x: roomX > 0 ? (rect.sx - dx * scale) / roomX : 0.5,
    y: roomY > 0 ? (rect.sy - dy * scale) / roomY : 0.5,
  });
}

/**
 * Zoom keeping the crop's centre where it is (so zooming doesn't jump to a
 * corner).
 */
export function zoomCrop(source: Size, aspect: number, state: CropState, zoom: number): CropState {
  const before = cropRect(source, aspect, state);
  const centreX = before.sx + before.sw / 2;
  const centreY = before.sy + before.sh / 2;
  const next = clampCrop({ ...state, zoom });
  const after = cropRect(source, aspect, next);
  const roomX = source.width - after.sw;
  const roomY = source.height - after.sh;
  return clampCrop({
    zoom: next.zoom,
    x: roomX > 0 ? (centreX - after.sw / 2) / roomX : 0.5,
    y: roomY > 0 ? (centreY - after.sh / 2) / roomY : 0.5,
  });
}

/**
 * CSS for an <img> inside the frame so the frame shows exactly the crop:
 * percentages of the frame, so it holds at any frame size.
 */
export function cropStyle(source: Size, rect: CropRect): { width: string; height: string; left: string; top: string } {
  const pct = (value: number) => `${(value * 100).toFixed(4)}%`;
  return {
    width: pct(source.width / rect.sw),
    height: pct(source.height / rect.sh),
    left: pct(-rect.sx / rect.sw),
    top: pct(-rect.sy / rect.sh),
  };
}
