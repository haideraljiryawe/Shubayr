/* ---------------------------------------------------------------------------
 * Crop geometry for the shared image editor (VIS-021): products, categories
 * and brands are square, banners 2:1. Kept pure so the rules are unit-tested;
 * drawing lives in image-crop-browser.ts.
 *
 * The crop is always the frame's aspect ratio. At zoom 1 it is the largest
 * such rectangle the picture holds — the centred crop that removes the same
 * amount from both ends of the longer side. Zooming in (zoom > 1) shrinks it
 * around the same point; zooming out (zoom < 1) grows it past the picture, so
 * the whole picture fits with even margins (filled white, or left transparent
 * where the destination keeps transparency). `x`/`y` (0–1) place the crop
 * along the room left on each axis — 0.5 is centred; on an axis where the
 * picture is smaller than the crop it always stays centred, so zooming out
 * never leaves a margin on one side only.
 *
 * The output keeps the aspect exactly and is never enlarged: a crop smaller
 * than the target size is sent at its own size (and flagged).
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

/** NOTE-006 / VIS-009: a 1:1 master around 1024 × 1024. */
export const CATEGORY_CROP: CropTarget = { aspect: 1, width: 1024, minWidth: 512 };
/** NOTE-001: a shared 2:1 composition, starting at 1600 × 800. */
export const BANNER_CROP: CropTarget = { aspect: 2, width: 1600, minWidth: 1200 };
/** VIS-008: product pictures are saved square, at most 1600 × 1600. */
export const PRODUCT_CROP: CropTarget = { aspect: 1, width: 1600, minWidth: 600 };
/** VIS-021: a brand's logo is saved square. */
export const BRAND_CROP: CropTarget = { aspect: 1, width: 800, minWidth: 256 };

/** How far in the slider's right end goes. */
export const MAX_ZOOM = 4;
/** How far out the slider's left end goes when the picture already fits (a square picture in a square). */
export const MAX_ZOOM_OUT = 0.5;
export const CENTRED: CropState = { zoom: 1, x: 0.5, y: 0.5 };

/** The slider runs 0–100; the middle (50) is the centred crop (zoom 1). */
export const SLIDER_MIN = 0;
export const SLIDER_MAX = 100;
export const SLIDER_MIDDLE = 50;
/** One press of − or +. */
export const SLIDER_STEP = 10;

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The largest rectangle of the frame's aspect that the picture holds (zoom 1). */
function baseCrop(source: Size, aspect: number): Size {
  const fitsWide = source.width / source.height > aspect;
  const height = fitsWide ? source.height : source.width / aspect;
  return { width: height * aspect, height };
}

/**
 * The smallest zoom the slider offers: far enough out that the whole picture
 * fits inside the frame, and never less room than MAX_ZOOM_OUT — so even a
 * picture that is already the frame's shape can be made smaller, with a
 * margin (a logo that needs breathing room).
 */
export function minZoom(source: Size, aspect: number): number {
  const base = baseCrop(source, aspect);
  // The zoom at which the crop just contains the whole picture.
  const contain = Math.min(base.width / source.width, base.height / source.height);
  return Math.min(MAX_ZOOM_OUT, contain);
}

export function clampCrop(state: CropState, source?: Size, aspect?: number): CropState {
  const floor = source && aspect ? minZoom(source, aspect) : MAX_ZOOM_OUT;
  return {
    zoom: clamp(Number.isFinite(state.zoom) ? state.zoom : 1, floor, MAX_ZOOM),
    x: clamp(Number.isFinite(state.x) ? state.x : 0.5, 0, 1),
    y: clamp(Number.isFinite(state.y) ? state.y : 0.5, 0, 1),
  };
}

/**
 * The part of the source picture the crop takes, in source pixels. Zoomed
 * out, it reaches past the picture (negative sx/sy): that is the margin.
 */
export function cropRect(source: Size, aspect: number, state: CropState): CropRect {
  const { zoom, x, y } = clampCrop(state, source, aspect);
  const base = baseCrop(source, aspect);
  const sw = base.width / zoom;
  const sh = base.height / zoom;
  const roomX = source.width - sw;
  const roomY = source.height - sh;
  // Smaller than the crop on an axis: centred on that axis, whatever x/y say.
  return { sx: roomX > 0 ? roomX * x : roomX / 2, sy: roomY > 0 ? roomY * y : roomY / 2, sw, sh };
}

/** The output picture's size: the target width, or the crop's own if smaller — never enlarged. */
export function outputSize(rect: CropRect, target: CropTarget): Size {
  const width = Math.max(1, Math.min(target.width, Math.floor(rect.sw)));
  return { width, height: Math.max(1, Math.round(width / target.aspect)) };
}

/**
 * Where the whole source picture lands on an output canvas of `output` size:
 * drawing the full picture there, over the margin colour, gives exactly the
 * crop — the margins of a zoomed-out crop included.
 */
export function drawPlacement(source: Size, rect: CropRect, output: Size): { dx: number; dy: number; dw: number; dh: number } {
  const scale = output.width / rect.sw;
  return { dx: -rect.sx * scale, dy: -rect.sy * scale, dw: source.width * scale, dh: source.height * scale };
}

/** Too few source pixels for a sharp result at the target size. */
export function isLowResolution(rect: CropRect, target: CropTarget): boolean {
  return rect.sw < target.minWidth;
}

/** Whether the crop leaves margins around the picture (zoomed out past it). */
export function hasMargins(source: Size, rect: CropRect): boolean {
  return rect.sx < -0.5 || rect.sy < -0.5 || rect.sx + rect.sw > source.width + 0.5 || rect.sy + rect.sh > source.height + 0.5;
}

/**
 * Drag the picture by (dx, dy) screen pixels inside a frame `frameWidth` wide:
 * the picture follows the pointer, so the crop moves the other way. An axis
 * with no room (the picture smaller than the crop there) doesn't move.
 */
export function panCrop(source: Size, aspect: number, state: CropState, dx: number, dy: number, frameWidth: number): CropState {
  const rect = cropRect(source, aspect, state);
  if (frameWidth <= 0) return state;
  const scale = rect.sw / frameWidth;
  const roomX = source.width - rect.sw;
  const roomY = source.height - rect.sh;
  return clampCrop(
    {
      zoom: state.zoom,
      x: roomX > 0 ? (rect.sx - dx * scale) / roomX : state.x,
      y: roomY > 0 ? (rect.sy - dy * scale) / roomY : state.y,
    },
    source,
    aspect,
  );
}

/** Zoom keeping the crop's centre where it is (so zooming doesn't jump to a corner). */
export function zoomCrop(source: Size, aspect: number, state: CropState, zoom: number): CropState {
  const before = cropRect(source, aspect, state);
  const centreX = before.sx + before.sw / 2;
  const centreY = before.sy + before.sh / 2;
  const next = clampCrop({ ...state, zoom }, source, aspect);
  const after = cropRect(source, aspect, next);
  const roomX = source.width - after.sw;
  const roomY = source.height - after.sh;
  return clampCrop(
    {
      zoom: next.zoom,
      x: roomX > 0 ? (centreX - after.sw / 2) / roomX : state.x,
      y: roomY > 0 ? (centreY - after.sh / 2) / roomY : state.y,
    },
    source,
    aspect,
  );
}

/**
 * The "Image size" slider (VIS-021): its middle is the centred crop, the left
 * half zooms out to minZoom and the right half in to MAX_ZOOM, each half on a
 * logarithmic scale so equal steps feel equal both ways.
 */
export function sliderToZoom(source: Size, aspect: number, value: number): number {
  const position = clamp(value, SLIDER_MIN, SLIDER_MAX);
  if (position >= SLIDER_MIDDLE) return MAX_ZOOM ** ((position - SLIDER_MIDDLE) / (SLIDER_MAX - SLIDER_MIDDLE));
  return minZoom(source, aspect) ** ((SLIDER_MIDDLE - position) / (SLIDER_MIDDLE - SLIDER_MIN));
}

export function zoomToSlider(source: Size, aspect: number, zoom: number): number {
  const floor = minZoom(source, aspect);
  const value = clamp(zoom, floor, MAX_ZOOM);
  if (value >= 1) return SLIDER_MIDDLE + (Math.log(value) / Math.log(MAX_ZOOM)) * (SLIDER_MAX - SLIDER_MIDDLE);
  return SLIDER_MIDDLE - (Math.log(value) / Math.log(floor)) * (SLIDER_MIDDLE - SLIDER_MIN);
}

/**
 * CSS for an <img> inside the frame so the frame shows exactly the crop:
 * percentages of the frame, so it holds at any frame size (and the margins
 * of a zoomed-out crop show as the frame's own background).
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
