import { describe, expect, it } from "vitest";
import type { PickedSku } from "@/components/inventory/sku-picker";
import {
  BANNER_CROP,
  BRAND_CROP,
  CENTRED,
  MAX_ZOOM,
  PRODUCT_CROP,
  SLIDER_MAX,
  SLIDER_MIDDLE,
  SLIDER_MIN,
  cropRect,
  drawPlacement,
  hasMargins,
  minZoom,
  outputSize,
  panCrop,
  sliderToZoom,
  zoomCrop,
  zoomToSlider,
  type Size,
} from "@/lib/image-crop";
import {
  blankEntry,
  entryIsDirty,
  entryOf,
  productLabel,
  removeLine,
  restoredLines,
  upsertLine,
  validateEntry,
  variantAttributes,
  type InvoiceEntry,
  type InvoiceLine,
} from "@/lib/invoice-entry";
import { isStoredImage, mediaOperations, type ImageDraft, type ProductImage } from "@/lib/product-images";
import { searchView, type SkuSearch } from "@/lib/sku-search";

/* ------------------------------------------------------------- VIS-021 */

/** Where source pixel (x, y) lands in the output, as drawCrop draws it. */
function landing(source: Size, aspect: number, state: typeof CENTRED, target = PRODUCT_CROP) {
  const rect = cropRect(source, aspect, state);
  const out = outputSize(rect, target);
  const place = drawPlacement(source, rect, out);
  return { rect, out, place, at: (x: number, y: number) => [place.dx + (x / source.width) * place.dw, place.dy + (y / source.height) * place.dh] };
}

describe("VIS-021 crop math → output pixels", () => {
  const portrait = { width: 1000, height: 2000 };
  const landscape = { width: 3000, height: 1500 };
  const square = { width: 1200, height: 1200 };

  it("starts centred, removing the same from both ends of the longer side, and writes a square file", () => {
    for (const source of [portrait, landscape, square]) {
      const { rect, out, place } = landing(source, 1, CENTRED);
      expect(out.width).toBe(out.height);
      // Equal excess both sides.
      expect(rect.sx * 2 + rect.sw).toBeCloseTo(source.width);
      expect(rect.sy * 2 + rect.sh).toBeCloseTo(source.height);
      // The drawn picture covers the canvas exactly on the short side.
      if (source.width <= source.height) {
        expect(place.dx).toBeCloseTo(0);
        expect(place.dw).toBeCloseTo(out.width);
      } else {
        expect(place.dy).toBeCloseTo(0);
        expect(place.dh).toBeCloseTo(out.height);
      }
    }
    // A portrait 1000 × 2000: the middle 1000 × 1000, at its own size (never enlarged to 1600).
    expect(landing(portrait, 1, CENTRED).out).toEqual({ width: 1000, height: 1000 });
    expect(cropRect(portrait, 1, CENTRED)).toEqual({ sx: 0, sy: 500, sw: 1000, sh: 1000 });
    expect(cropRect(landscape, 1, CENTRED)).toEqual({ sx: 750, sy: 0, sw: 1500, sh: 1500 });
    expect(cropRect(square, 1, CENTRED)).toEqual({ sx: 0, sy: 0, sw: 1200, sh: 1200 });
  });

  it("the crop's corners land exactly on the output's corners", () => {
    const state = zoomCrop(landscape, 1, { zoom: 1, x: 0.2, y: 0.5 }, 2);
    const { rect, out, at } = landing(landscape, 1, state);
    const [left, top] = at(rect.sx, rect.sy);
    const [right, bottom] = at(rect.sx + rect.sw, rect.sy + rect.sh);
    expect(left).toBeCloseTo(0);
    expect(top).toBeCloseTo(0);
    expect(right).toBeCloseTo(out.width);
    expect(bottom).toBeCloseTo(out.height);
  });

  it("dragging reveals the sides of a landscape and the top/bottom of a portrait", () => {
    // Picture dragged right → more of its left side.
    expect(cropRect(landscape, 1, panCrop(landscape, 1, CENTRED, 200, 0, 300)).sx).toBeLessThan(750);
    expect(cropRect(landscape, 1, panCrop(landscape, 1, CENTRED, -200, 0, 300)).sx).toBeGreaterThan(750);
    // Picture dragged down → more of its top.
    expect(cropRect(portrait, 1, panCrop(portrait, 1, CENTRED, 0, 200, 300)).sy).toBeLessThan(500);
    expect(cropRect(portrait, 1, panCrop(portrait, 1, CENTRED, 0, -200, 300)).sy).toBeGreaterThan(500);
    // Never past the picture's edge.
    expect(cropRect(portrait, 1, panCrop(portrait, 1, CENTRED, 0, 1e6, 300)).sy).toBe(0);
  });

  it("the Image size slider starts at its midpoint and changes the scale both ways", () => {
    for (const source of [portrait, landscape, square]) {
      expect(sliderToZoom(source, 1, SLIDER_MIDDLE)).toBe(1);
      expect(zoomToSlider(source, 1, CENTRED.zoom)).toBe(SLIDER_MIDDLE);
      const out = sliderToZoom(source, 1, SLIDER_MIN);
      const inn = sliderToZoom(source, 1, SLIDER_MAX);
      expect(out).toBeLessThan(1);
      expect(inn).toBe(MAX_ZOOM);
      // Moving left shows more of the picture (a bigger crop), right shows less.
      expect(cropRect(source, 1, { ...CENTRED, zoom: sliderToZoom(source, 1, 30) }).sw).toBeGreaterThan(cropRect(source, 1, CENTRED).sw);
      expect(cropRect(source, 1, { ...CENTRED, zoom: sliderToZoom(source, 1, 70) }).sw).toBeLessThan(cropRect(source, 1, CENTRED).sw);
      // Round trip.
      for (const value of [0, 12.5, 37, 50, 63, 88, 100]) expect(zoomToSlider(source, 1, sliderToZoom(source, 1, value))).toBeCloseTo(value, 6);
    }
  });

  it("all the way out, the whole picture fits with even margins — never distorted, never off to one side", () => {
    const zoom = minZoom(landscape, 1);
    expect(zoom).toBe(0.5); // a 2:1 picture fits a square at half scale
    const { rect, out, place } = landing(landscape, 1, { zoom, x: 0, y: 1 });
    expect(hasMargins(landscape, rect)).toBe(true);
    // The whole width is in, centred vertically however x/y were set.
    expect(place.dx).toBeCloseTo(0);
    expect(place.dw).toBeCloseTo(out.width);
    expect(place.dy).toBeCloseTo((out.height - place.dh) / 2);
    // Aspect kept.
    expect(place.dw / place.dh).toBeCloseTo(landscape.width / landscape.height);
    // A square picture can still be made smaller (a logo with a margin).
    expect(minZoom(square, 1)).toBe(0.5);
    const logo = landing(square, 1, { ...CENTRED, zoom: 0.5 }, BRAND_CROP);
    expect(logo.place.dx).toBeCloseTo(logo.out.width / 4);
    expect(logo.out.width).toBe(logo.out.height);
  });

  it("a banner keeps its own 2:1 output", () => {
    const photo = { width: 4000, height: 3000 };
    const { out } = landing(photo, 2, CENTRED, BANNER_CROP);
    expect(out).toEqual({ width: 1600, height: 800 });
    expect(sliderToZoom(photo, 2, SLIDER_MIDDLE)).toBe(1);
  });
});

/* ------------------------------------------------------------- VIS-008 */

describe("VIS-008 deleting a picture is a pending change", () => {
  const stored: ProductImage[] = [
    { id: "img-1", url: "https://cdn/1.webp", sort_order: 0 } as ProductImage,
    { id: "img-2", url: "https://cdn/2.webp", sort_order: 1 } as ProductImage,
  ];
  const tile = (over: Partial<ImageDraft>): ImageDraft => ({ key: "k", preview: "https://cdn/1.webp", phase: "ready", progress: 100, ...over });

  it("tells a saved picture from one uploaded in this session", () => {
    expect(isStoredImage(tile({ imageId: "img-1", url: "https://cdn/1.webp" }))).toBe(true);
    expect(isStoredImage(tile({ url: "https://cdn/new.webp", preview: "blob:local" }))).toBe(false);
    expect(isStoredImage(tile({ phase: "uploading", url: undefined, preview: "blob:x" }))).toBe(false);
  });

  it("nothing is removed until the product is saved; the save sends exactly the removal", () => {
    const onScreen = [tile({ key: "img-2", imageId: "img-2", url: "https://cdn/2.webp", preview: "https://cdn/2.webp" })];
    // The removal exists only in what Save would send…
    expect(mediaOperations(stored, onScreen)).toEqual([{ op: "remove", image_id: "img-1" }]);
    // …and putting the picture back (undo / cancel) sends nothing at all.
    const restored = [tile({ key: "img-1", imageId: "img-1", url: "https://cdn/1.webp" }), ...onScreen];
    expect(mediaOperations(stored, restored)).toEqual([]);
  });
});

/* ------------------------------------------------------------- VIS-022 */

const sku = (over: Partial<PickedSku> = {}): PickedSku => ({
  variantId: "v-1",
  productId: "p-1",
  sku: "RICE-5KG",
  productName: "رز بسمتي",
  variantLabel: "5 كغم",
  baseUnit: "piece",
  wholeUnitsOnly: true,
  tracksExpiry: false,
  ...over,
});
const entry = (over: Partial<InvoiceEntry> = {}): InvoiceEntry => ({ ...blankEntry(), sku: sku(), packs: "2", packSize: "10", cost: "15000", ...over });

describe("VIS-022 invoice product editor", () => {
  it("validates before a row exists: product, quantity, pack size, cost, whole units", () => {
    expect(validateEntry(blankEntry())).toEqual({ sku: "sku", packs: "packs", cost: "cost" });
    expect(validateEntry(entry())).toEqual({});
    expect(validateEntry(entry({ packs: "0" })).packs).toBe("packs");
    expect(validateEntry(entry({ packSize: "0" })).packSize).toBe("packSize");
    expect(validateEntry(entry({ cost: "" })).cost).toBe("cost");
    // 1.5 packs × 1 piece of a whole-units SKU is refused; a decimal SKU takes it.
    expect(validateEntry(entry({ packs: "1.5", packSize: "1" })).packs).toBe("wholeUnits");
    expect(validateEntry(entry({ packs: "1.5", packSize: "1", sku: sku({ wholeUnitsOnly: false }) }))).toEqual({});
  });

  it("Add appends one row and moves the key on; the same product twice stays two rows", () => {
    const first = upsertLine([], entry(), null, 1);
    expect(first.lines).toHaveLength(1);
    expect(first.lines[0]).toMatchObject({ key: 1, packs: "2", cost: "15000" });
    expect(first.nextKey).toBe(2);
    const second = upsertLine(first.lines, entry({ lot: "B-2", cost: "14000" }), null, first.nextKey);
    expect(second.lines.map((line) => [line.key, line.sku?.sku, line.lot])).toEqual([
      [1, "RICE-5KG", ""],
      [2, "RICE-5KG", "B-2"],
    ]);
  });

  it("Save changes updates the same row in place, never a duplicate", () => {
    const { lines, nextKey } = upsertLine(upsertLine([], entry(), null, 1).lines, entry({ packs: "5" }), null, 2);
    const saved = upsertLine(lines, { ...entryOf(lines[0]), packs: "3" }, 1, nextKey);
    expect(saved.lines).toHaveLength(2);
    expect(saved.lines[0]).toMatchObject({ key: 1, packs: "3" });
    expect(saved.lines[1]).toMatchObject({ key: 2, packs: "5" });
    expect(saved.nextKey).toBe(nextKey);
  });

  it("Cancel editing changes nothing, and unsaved editor input is detected before switching rows", () => {
    const lines = upsertLine([], entry(), null, 1).lines;
    const row = lines[0];
    // Loaded unchanged: nothing to lose.
    expect(entryIsDirty(entryOf(row), row)).toBe(false);
    // Typed a new cost: switching must ask first.
    expect(entryIsDirty({ ...entryOf(row), cost: "16000" }, row)).toBe(true);
    // Add mode: a blank editor is clean, anything picked or typed is not.
    expect(entryIsDirty(blankEntry(), null)).toBe(false);
    expect(entryIsDirty({ ...blankEntry(), sku: sku() }, null)).toBe(true);
    expect(entryIsDirty({ ...blankEntry(), lot: "  " }, null)).toBe(false);
    // Cancelling never touched the rows.
    expect(lines).toEqual([row]);
  });

  it("Remove takes out only that row; an older draft's empty line is dropped on restore", () => {
    const lines: InvoiceLine[] = [
      { ...entry(), key: 1 },
      { ...entry({ lot: "B-2" }), key: 2 },
    ];
    expect(removeLine(lines, 1).map((line) => line.key)).toEqual([2]);
    expect(restoredLines([...lines, { ...blankEntry(), key: 3 }]).map((line) => line.key)).toEqual([1, 2]);
    expect(restoredLines(undefined)).toEqual([]);
  });

  it("names a row by product, variant and SKU", () => {
    expect(productLabel(sku())).toBe("رز بسمتي · 5 كغم · RICE-5KG");
    expect(productLabel(sku({ variantLabel: "" }))).toBe("رز بسمتي · RICE-5KG");
    expect(variantAttributes({ color: "أحمر", size: "L", empty: null })).toBe("أحمر · L");
    expect(variantAttributes(null)).toBe("");
  });
});

/* ------------------------------------------------------------- VIS-023 */

describe("VIS-023 search states", () => {
  const done = (query: string, results: number[]): SkuSearch<number> => ({ status: "done", query, results });

  it("says 'no matching products' only for a search that succeeded and found nothing", () => {
    expect(searchView({ status: "idle" }, "ر")).toBe("idle");
    expect(searchView({ status: "idle" }, "رز")).toBe("searching");
    expect(searchView({ status: "searching", query: "رز" }, "رز")).toBe("searching");
    expect(searchView(done("رز", []), "رز")).toBe("none");
    expect(searchView(done("رز", [1]), "رز")).toBe("results");
    expect(searchView({ status: "failed", query: "رز", reason: "failed" }, "رز")).toBe("failed");
  });

  it("never shows an older search's answer for newer text", () => {
    expect(searchView(done("رز", []), "رز بسمتي")).toBe("searching");
    expect(searchView({ status: "failed", query: "رز", reason: "failed" }, "رز ب")).toBe("searching");
    // A product without variants offers nothing to choose.
    expect(searchView(done("رز", [0]), "رز", (n) => n)).toBe("none");
  });
});
