import { describe, expect, it } from "vitest";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import {
  bannerStatus,
  createBody,
  duplicateBody,
  filterBanners,
  formFromBanner,
  modeChoices,
  nextSortOrder,
  patchBody,
  reorderPatches,
  scheduleModeOf,
  scheduleOf,
  sortBanners,
  switchMode,
  validateBanner,
  type Banner,
} from "@/lib/banners";
import { descriptionChanges, mayBeFallback } from "@/lib/category-content";
import type { Category } from "@/lib/catalog";
import { DESCRIPTION_GUIDE, NAME_GUIDE, editorialAdvice, graphemeCount, wordCount } from "@/lib/editorial";
import {
  BANNER_CROP,
  CATEGORY_CROP,
  CENTRED,
  cropRect,
  cropStyle,
  isLowResolution,
  outputSize,
  panCrop,
  zoomCrop,
} from "@/lib/image-crop";
import { NAV_ITEMS } from "@/lib/nav";
import { isRouteEnabled, parseModules } from "@/lib/modules";

const banner = (over: Partial<Banner> = {}): Banner => ({
  id: "b-1",
  title: "عروض الشتاء",
  subtitle: null,
  image_url: "http://localhost:8000/api/v1/media/m-1",
  cta_text: null,
  link_url: null,
  sort_order: 0,
  is_active: true,
  starts_at: null,
  ends_at: null,
  created_at: "2026-10-01T09:00:00.000Z",
  ...over,
});

describe("banner status — Disabled wins, an expired banner is never Active", () => {
  // 2026-10-19 00:00 in Baghdad is 2026-10-18 21:00 UTC (no daylight saving).
  const startsBaghdadMidnight = "2026-10-18T21:00:00.000Z";
  const endsBaghdadMidnight = "2026-10-25T21:00:00.000Z";
  const scheduled = banner({ starts_at: startsBaghdadMidnight, ends_at: endsBaghdadMidnight });

  it("follows the public feed, both window ends inclusive", () => {
    expect(bannerStatus(scheduled, new Date("2026-10-18T20:59:59.999Z"))).toBe("scheduled");
    expect(bannerStatus(scheduled, new Date(startsBaghdadMidnight))).toBe("active");
    expect(bannerStatus(scheduled, new Date(endsBaghdadMidnight))).toBe("active");
    expect(bannerStatus(scheduled, new Date("2026-10-25T21:00:00.001Z"))).toBe("expired");
  });

  it("Disabled takes precedence over every window", () => {
    for (const at of ["2026-10-01T00:00:00Z", "2026-10-20T00:00:00Z", "2026-11-30T00:00:00Z"]) {
      expect(bannerStatus({ ...scheduled, is_active: false }, new Date(at))).toBe("disabled");
    }
  });

  it("permanent and one-boundary records", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    expect(bannerStatus(banner(), now)).toBe("active");
    expect(bannerStatus(banner({ ends_at: "2026-10-09T21:00:00Z" }), now)).toBe("expired");
    expect(bannerStatus(banner({ starts_at: "2026-11-01T00:00:00Z" }), now)).toBe("scheduled");
    expect(scheduleModeOf(banner({ starts_at: "2026-11-01T00:00:00Z" }))).toBe("startOnly");
    expect(scheduleModeOf(banner({ ends_at: "2026-11-01T00:00:00Z" }))).toBe("endOnly");
  });

  it("filters by effective status", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const list = [banner({ id: "a" }), banner({ id: "b", is_active: false }), banner({ id: "c", ends_at: "2026-10-01T00:00:00Z" })];
    expect(filterBanners(list, "active", now).map((item) => item.id)).toEqual(["a"]);
    expect(filterBanners(list, "disabled", now).map((item) => item.id)).toEqual(["b"]);
    expect(filterBanners(list, "expired", now).map((item) => item.id)).toEqual(["c"]);
    expect(filterBanners(list, "", now)).toHaveLength(3);
  });
});

describe("banner schedule in Baghdad time", () => {
  it("shows the stored instants as Baghdad wall time and sends them back unchanged", () => {
    const form = formFromBanner(banner({ starts_at: "2026-10-18T21:00:00.000Z", ends_at: "2026-10-25T20:59:00.000Z" }));
    expect(form.mode).toBe("scheduled");
    expect(form.starts).toBe("2026-10-19T00:00");
    expect(form.ends).toBe("2026-10-25T23:59");
    expect(scheduleOf(form)).toEqual({ starts_at: "2026-10-18T21:00:00.000Z", ends_at: "2026-10-25T20:59:00.000Z" });
  });

  it("switching modes keeps the typed dates in the form but says which saved ones go", () => {
    const form = formFromBanner(banner({ starts_at: "2026-10-18T21:00:00.000Z", ends_at: "2026-10-25T21:00:00.000Z" }));
    const permanent = switchMode(form, "permanent");
    expect(permanent.drops).toEqual({ starts: "2026-10-19T00:00", ends: "2026-10-26T00:00" });
    expect(scheduleOf(permanent.form)).toEqual({ starts_at: null, ends_at: null });
    // …and back again: nothing lost while the editor makes up their mind.
    const back = switchMode(permanent.form, "scheduled");
    expect(back.drops).toEqual({ starts: null, ends: null });
    expect(scheduleOf(back.form).starts_at).toBe("2026-10-18T21:00:00.000Z");
  });

  it("permanent → scheduled needs both dates, end after start", () => {
    const form = { ...formFromBanner(banner()), mode: "scheduled" as const };
    const kinds = (f: typeof form) => validateBanner(f, { hasImage: true }).map((p) => `${p.field}:${p.kind}`);
    expect(kinds(form)).toEqual(["starts:required", "ends:required"]);
    expect(kinds({ ...form, starts: "2026-10-20T10:00", ends: "2026-10-20T10:00" })).toEqual(["ends:notAfterStart"]);
    expect(kinds({ ...form, starts: "2026-10-20T10:00", ends: "2026-10-20T10:01" })).toEqual([]);
  });

  it("a one-boundary record is offered as it is and saved back unchanged", () => {
    const startOnly = banner({ starts_at: "2026-11-01T06:00:00.000Z" });
    expect(modeChoices(startOnly)).toEqual(["permanent", "scheduled", "startOnly"]);
    expect(modeChoices(banner())).toEqual(["permanent", "scheduled"]);
    expect(modeChoices(null)).toEqual(["permanent", "scheduled"]);
    const form = formFromBanner(startOnly);
    expect(form.mode).toBe("startOnly");
    expect(validateBanner(form, { hasImage: true })).toEqual([]);
    expect(patchBody(form, startOnly, startOnly.image_url)).toBeNull();
  });
});

describe("banner bodies", () => {
  it("a new banner starts disabled; empty text becomes null", () => {
    const form = { ...formFromBanner(null), title: "  وصل حديثًا ", subtitle: " ", linkUrl: "https://shubayr.com/offers" };
    expect(form.isActive).toBe(false);
    expect(createBody(form, "http://localhost:8000/api/v1/media/m-2", 3)).toEqual({
      title: "وصل حديثًا",
      subtitle: null,
      image_url: "http://localhost:8000/api/v1/media/m-2",
      cta_text: null,
      link_url: "https://shubayr.com/offers",
      sort_order: 3,
      is_active: false,
      starts_at: null,
      ends_at: null,
    });
  });

  it("an edit sends only what changed; disabling keeps the dates", () => {
    const original = banner({ starts_at: "2026-10-18T21:00:00.000Z", ends_at: "2026-10-25T21:00:00.000Z" });
    const form = { ...formFromBanner(original), isActive: false };
    expect(patchBody(form, original, original.image_url)).toEqual({ is_active: false });
    expect(patchBody(formFromBanner(original), original, "http://localhost:8000/api/v1/media/new")).toEqual({
      image_url: "http://localhost:8000/api/v1/media/new",
    });
  });

  it("validates link and lengths without touching the text", () => {
    const form = { ...formFromBanner(null), title: "x", linkUrl: "/categories" };
    expect(validateBanner(form, { hasImage: false }).map((p) => p.field)).toEqual(["linkUrl", "image"]);
    expect(validateBanner({ ...form, linkUrl: "javascript:alert(1)" }, { hasImage: true }).map((p) => p.field)).toEqual(["linkUrl"]);
    expect(validateBanner({ ...form, linkUrl: "https://example.com/a?b=1" }, { hasImage: true })).toEqual([]);
    expect(validateBanner({ ...form, linkUrl: "", title: "a".repeat(201) }, { hasImage: true })).toEqual([{ field: "title", kind: "tooLong" }]);
  });

  it("duplicates into a disabled copy placed last", () => {
    const list = [banner({ id: "a", sort_order: 0 }), banner({ id: "b", sort_order: 4 })];
    const copy = duplicateBody(banner({ link_url: "https://example.com", cta_text: "تسوق" }), nextSortOrder(list));
    expect(copy).toMatchObject({ is_active: false, sort_order: 5, link_url: "https://example.com", cta_text: "تسوق" });
    expect(nextSortOrder([])).toBe(0);
  });
});

describe("banner order", () => {
  it("sorts like the API: sort order, creation, id", () => {
    const list = sortBanners([
      banner({ id: "c", sort_order: 1, created_at: "2026-10-02T00:00:00Z" }),
      banner({ id: "b", sort_order: 1, created_at: "2026-10-01T00:00:00Z" }),
      banner({ id: "a", sort_order: 0, created_at: "2026-10-03T00:00:00Z" }),
    ]);
    expect(list.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("distinct neighbours swap their numbers", () => {
    const list = [banner({ id: "a", sort_order: 0 }), banner({ id: "b", sort_order: 5 }), banner({ id: "c", sort_order: 9 })];
    expect(reorderPatches(list, 1, -1)).toEqual([
      { id: "b", sort_order: 0 },
      { id: "a", sort_order: 5 },
    ]);
    expect(reorderPatches(list, 0, -1)).toEqual([]);
    expect(reorderPatches(list, 2, 1)).toEqual([]);
  });

  it("ties are renumbered so the move holds", () => {
    const list = [banner({ id: "a", sort_order: 0 }), banner({ id: "b", sort_order: 0 }), banner({ id: "c", sort_order: 0 })];
    expect(reorderPatches(list, 2, -1)).toEqual([
      { id: "c", sort_order: 1 },
      { id: "b", sort_order: 2 },
    ]);
  });
});

describe("editorial guidance counts what people see", () => {
  it("counts graphemes, not code units", () => {
    expect(graphemeCount("إلكترونيات")).toBe(10);
    // Harakat combine with their letter: مُنَظِّفات is six letters, ten code points.
    expect("مُنَظِّفات".length).toBe(10);
    expect(graphemeCount("مُنَظِّفات")).toBe(6);
    expect(graphemeCount("👩‍👩‍👧")).toBe(1);
    expect(graphemeCount("🇮🇶")).toBe(1);
    expect(graphemeCount("Café")).toBe(4);
  });

  it("warns past the suggestion, never blocks", () => {
    expect(editorialAdvice("أدوات المطبخ", NAME_GUIDE)).toEqual({ chars: 12, words: 2, long: false });
    expect(editorialAdvice("أدوات وأجهزة المطبخ والمنزل الحديثة", NAME_GUIDE).long).toBe(true);
    expect(editorialAdvice("a".repeat(24), NAME_GUIDE).long).toBe(false);
    expect(editorialAdvice("a".repeat(25), NAME_GUIDE).long).toBe(true);
    expect(editorialAdvice("كل ما تحتاجه لمطبخك من أدوات وأجهزة", DESCRIPTION_GUIDE).long).toBe(false);
    expect(wordCount("  one   two\nthree ")).toBe(3);
  });
});

describe("crop geometry", () => {
  it("a category crop is square and never enlarged", () => {
    const landscape = cropRect({ width: 3000, height: 2000 }, 1, CENTRED);
    expect(landscape).toEqual({ sx: 500, sy: 0, sw: 2000, sh: 2000 });
    expect(outputSize(landscape, CATEGORY_CROP)).toEqual({ width: 1024, height: 1024 });
    const small = cropRect({ width: 400, height: 600 }, 1, CENTRED);
    expect(outputSize(small, CATEGORY_CROP)).toEqual({ width: 400, height: 400 });
    expect(isLowResolution(small, CATEGORY_CROP)).toBe(true);
  });

  it("a banner crop is exactly 2:1, starting at 1600 × 800", () => {
    const photo = cropRect({ width: 4000, height: 3000 }, 2, CENTRED);
    expect(photo.sw / photo.sh).toBe(2);
    expect(outputSize(photo, BANNER_CROP)).toEqual({ width: 1600, height: 800 });
    const narrow = cropRect({ width: 1000, height: 1000 }, 2, CENTRED);
    expect(narrow).toEqual({ sx: 0, sy: 250, sw: 1000, sh: 500 });
    expect(outputSize(narrow, BANNER_CROP)).toEqual({ width: 1000, height: 500 });
    expect(isLowResolution(narrow, BANNER_CROP)).toBe(true);
  });

  it("zoom keeps the centre; dragging follows the pointer and stays inside", () => {
    const size = { width: 2000, height: 1000 };
    const zoomed = zoomCrop(size, 1, CENTRED, 2);
    const rect = cropRect(size, 1, zoomed);
    expect(rect.sw).toBe(500);
    expect(rect.sx + rect.sw / 2).toBeCloseTo(1000);
    expect(rect.sy + rect.sh / 2).toBeCloseTo(500);
    // Dragging the picture right shows more of its left side.
    const dragged = panCrop(size, 1, CENTRED, 100, 0, 400);
    expect(cropRect(size, 1, dragged).sx).toBeLessThan(500);
    const far = panCrop(size, 1, CENTRED, 100000, 0, 400);
    expect(cropRect(size, 1, far).sx).toBe(0);
  });

  it("the preview style shows exactly the crop", () => {
    const size = { width: 3000, height: 2000 };
    expect(cropStyle(size, cropRect(size, 1, CENTRED))).toEqual({ width: "150.0000%", height: "100.0000%", left: "-25.0000%", top: "0.0000%" });
  });
});

describe("category descriptions are sent only when changed", () => {
  const category = (over: Partial<Category> = {}): Category => ({
    id: "c-1",
    name_ar: "مطبخ",
    name_en: "Kitchen",
    description_ar: "كل ما تحتاجه لمطبخك",
    description_en: "كل ما تحتاجه لمطبخك",
    image_url: null,
    ...over,
  });

  it("an unrelated edit never writes the fallback copy back", () => {
    const original = category();
    expect(mayBeFallback(original)).toBe(true);
    expect(descriptionChanges(original, { ar: original.description_ar ?? "", en: original.description_en ?? "" })).toEqual({});
  });

  it("clears with null and keeps the text exactly as typed", () => {
    const original = category({ description_en: "Everything for your kitchen" });
    expect(mayBeFallback(original)).toBe(false);
    expect(descriptionChanges(original, { ar: "", en: "Everything for your kitchen" })).toEqual({ description_ar: null });
    expect(descriptionChanges(original, { ar: "  نص  بمسافات ", en: "Everything for your kitchen" })).toEqual({ description_ar: "  نص  بمسافات " });
  });

  it("a new category sends only the descriptions it has", () => {
    expect(descriptionChanges(null, { ar: "وصف", en: "  " })).toEqual({ description_ar: "وصف" });
    expect(descriptionChanges(null, { ar: "", en: "" })).toEqual({});
  });
});

describe("wiring", () => {
  it("Home banners is in the catalog module with catalog.products", () => {
    const item = NAV_ITEMS.find((entry) => entry.key === "banners");
    expect(item).toEqual({ key: "banners", href: "/catalog/banners", requires: ["catalog.products"] });
    expect(isRouteEnabled("/catalog/banners", parseModules("catalog"))).toBe(true);
    expect(isRouteEnabled("/catalog/banners", parseModules("orders"))).toBe(false);
  });

  it("every new message exists in both languages", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      value && typeof value === "object"
        ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix.slice(0, -1)];
    for (const ns of ["banners", "imageEditor", "editorial"] as const) {
      expect(keys((ar as Record<string, unknown>)[ns]).sort(), ns).toEqual(keys((en as Record<string, unknown>)[ns]).sort());
    }
    expect(ar.editorial.mayBeShortened).toBe("قد يُختصر هذا النص بـ … على الشاشات الصغيرة");
    expect(en.editorial.mayBeShortened).toBe("This text may be shortened with … on smaller screens");
  });
});
