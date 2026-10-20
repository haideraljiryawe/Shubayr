import { describe, expect, it } from "vitest";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import {
  categoryOptions,
  createBody,
  defaultsInFeedOrder,
  duplicateBody,
  filterBanners,
  formFromBanner,
  modeChoices,
  nextSortOrder,
  patchBody,
  reorderIds,
  scheduleModeOf,
  scheduleOf,
  sortBanners,
  switchMode,
  usableDefaults,
  validateBanner,
  type Banner,
} from "@/lib/banners";
import { mediaIdFromUrl, orphanedUploads } from "@/lib/media-cleanup";
import { descriptionChanges, descriptionDraft } from "@/lib/category-content";
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
  internal_name: "Winter banner",
  title_ar: "عروض الشتاء",
  title_en: "Winter offers",
  subtitle_ar: null,
  subtitle_en: null,
  cta_label_ar: null,
  cta_label_en: null,
  show_text: true,
  action_type: "none",
  action_target_id: null,
  action: { type: "none", url: null, target: null },
  is_default: false,
  default_priority: 0,
  sort_order: 0,
  is_active: true,
  effective_status: "active",
  starts_at: null,
  ends_at: null,
  created_at: "2026-10-01T09:00:00.000Z",
  ...over,
});

describe("banner status comes from the server", () => {
  it("filters by the API's effective_status, never by the local clock", () => {
    const list = [
      banner({ id: "a" }),
      banner({ id: "b", is_active: false, effective_status: "disabled" }),
      // The server says expired even though no end date is set here: it wins.
      banner({ id: "c", effective_status: "expired" }),
    ];
    expect(filterBanners(list, "active").map((item) => item.id)).toEqual(["a"]);
    expect(filterBanners(list, "disabled").map((item) => item.id)).toEqual(["b"]);
    expect(filterBanners(list, "expired").map((item) => item.id)).toEqual(["c"]);
    expect(filterBanners(list, "")).toHaveLength(3);
    expect(scheduleModeOf(banner({ starts_at: "2026-11-01T00:00:00Z" }))).toBe("startOnly");
    expect(scheduleModeOf(banner({ ends_at: "2026-11-01T00:00:00Z" }))).toBe("endOnly");
  });

  it("usable defaults are enabled, in date, and taken by priority then place", () => {
    const list = [
      banner({ id: "r" }),
      banner({ id: "d1", is_default: true, default_priority: 5, sort_order: 0 }),
      banner({ id: "d2", is_default: true, default_priority: 1, sort_order: 3 }),
      banner({ id: "d3", is_default: true, default_priority: 1, sort_order: 1 }),
      banner({ id: "off", is_default: true, default_priority: 0, is_active: false, effective_status: "disabled" }),
    ];
    expect(usableDefaults(list).map((item) => item.id)).toEqual(["d1", "d2", "d3"]);
    expect(defaultsInFeedOrder(list).map((item) => item.id)).toEqual(["d3", "d2", "d1"]);
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
  it("a new banner starts disabled, with text shown; empty text becomes null and legacy fields follow Arabic", () => {
    const form = {
      ...formFromBanner(null),
      internalName: " Winter hero ",
      titleAr: "  وصل حديثًا ",
      titleEn: "Just in",
      subtitleEn: "Fresh stock",
      action: "url" as const,
      linkUrl: "https://shubayr.com/offers",
    };
    expect(form.isActive).toBe(false);
    expect(form.showText).toBe(true);
    expect(createBody(form, "http://localhost:8000/api/v1/media/m-2", 3)).toEqual({
      title: "وصل حديثًا",
      subtitle: "Fresh stock",
      cta_text: null,
      internal_name: "Winter hero",
      title_ar: "وصل حديثًا",
      title_en: "Just in",
      subtitle_ar: null,
      subtitle_en: "Fresh stock",
      cta_label_ar: null,
      cta_label_en: null,
      show_text: true,
      image_url: "http://localhost:8000/api/v1/media/m-2",
      action_type: "url",
      action_target_id: null,
      link_url: "https://shubayr.com/offers",
      is_default: false,
      default_priority: 0,
      sort_order: 3,
      is_active: false,
      starts_at: null,
      ends_at: null,
    });
  });

  it("an image-only banner needs no title; its legacy title falls back to the internal name", () => {
    const form = { ...formFromBanner(null), internalName: "Eid artwork", showText: false };
    expect(validateBanner(form, { hasImage: true })).toEqual([]);
    expect(createBody(form, "http://x/media/m", 0)).toMatchObject({ title: "Eid artwork", show_text: false, title_ar: null, title_en: null });
    expect(validateBanner({ ...form, showText: true }, { hasImage: true })).toEqual([{ field: "title", kind: "required" }]);
  });

  it("product and category actions need a target; url needs a valid address; offers and none need nothing", () => {
    const base = { ...formFromBanner(null), internalName: "n", titleAr: "ع" };
    const fields = (f: typeof base) => validateBanner(f, { hasImage: true }).map((p) => `${p.field}:${p.kind}`);
    expect(fields({ ...base, action: "product" })).toEqual(["target:required"]);
    expect(fields({ ...base, action: "category" })).toEqual(["target:required"]);
    expect(fields({ ...base, action: "url" })).toEqual(["linkUrl:required"]);
    expect(fields({ ...base, action: "url", linkUrl: "javascript:alert(1)" })).toEqual(["linkUrl:invalid"]);
    expect(fields({ ...base, action: "offers" })).toEqual([]);
    const product = { id: "p-1", name_ar: "حذاء", name_en: "Shoe", available: null };
    const withProduct = { ...base, action: "product" as const, product };
    expect(fields(withProduct)).toEqual([]);
    expect(createBody(withProduct, "http://x/media/m", 0)).toMatchObject({ action_type: "product", action_target_id: "p-1", link_url: null });
    // A typed link is not sent with another action.
    expect(createBody({ ...base, action: "offers", linkUrl: "https://a.example" }, "http://x/media/m", 0)).toMatchObject({
      action_type: "offers",
      action_target_id: null,
      link_url: null,
    });
  });

  it("default banners carry a whole-number priority", () => {
    const base = { ...formFromBanner(null), internalName: "n", titleAr: "ع", isDefault: true };
    expect(validateBanner({ ...base, defaultPriority: "-1" }, { hasImage: true })).toEqual([{ field: "defaultPriority", kind: "invalid" }]);
    expect(validateBanner({ ...base, defaultPriority: "1.5" }, { hasImage: true })).toEqual([{ field: "defaultPriority", kind: "invalid" }]);
    expect(createBody({ ...base, defaultPriority: " 2 " }, "http://x/media/m", 0)).toMatchObject({ is_default: true, default_priority: 2 });
  });

  it("an edit sends only what changed; disabling keeps the dates", () => {
    const original = banner({ starts_at: "2026-10-18T21:00:00.000Z", ends_at: "2026-10-25T21:00:00.000Z" });
    const form = { ...formFromBanner(original), isActive: false };
    expect(patchBody(form, original, original.image_url)).toEqual({ is_active: false });
    expect(patchBody(formFromBanner(original), original, original.image_url)).toBeNull();
    expect(patchBody(formFromBanner(original), original, "http://localhost:8000/api/v1/media/new")).toEqual({
      image_url: "http://localhost:8000/api/v1/media/new",
    });
  });

  it("changing the Arabic title also updates the legacy title; the English one alone does not", () => {
    const original = banner();
    expect(patchBody({ ...formFromBanner(original), titleAr: "عروض جديدة" }, original, original.image_url)).toEqual({
      title_ar: "عروض جديدة",
      title: "عروض جديدة",
    });
    expect(patchBody({ ...formFromBanner(original), titleEn: "New offers" }, original, original.image_url)).toEqual({ title_en: "New offers" });
  });

  it("a saved product action round-trips; switching to offers clears the target", () => {
    const target = { id: "p-1", slug: null, name_ar: "حذاء", name_en: "Shoe", available: false };
    const original = banner({ action_type: "product", action_target_id: "p-1", action: { type: "product", url: null, target } });
    const form = formFromBanner(original);
    expect(form.product).toEqual({ id: "p-1", name_ar: "حذاء", name_en: "Shoe", available: false });
    expect(patchBody(form, original, original.image_url)).toBeNull();
    expect(patchBody({ ...form, action: "offers" }, original, original.image_url)).toEqual({
      action_type: "offers",
      action_target_id: null,
      link_url: null,
    });
    // A legacy link banner is a url action with the same address.
    const legacy = banner({ link_url: "https://a.example/x", action_type: "url", action: { type: "url", url: "https://a.example/x", target: null } });
    expect(formFromBanner(legacy)).toMatchObject({ action: "url", linkUrl: "https://a.example/x" });
    expect(patchBody(formFromBanner(legacy), legacy, legacy.image_url)).toBeNull();
  });

  it("duplicates into a disabled regular copy placed last", () => {
    const list = [banner({ id: "a", sort_order: 0 }), banner({ id: "b", sort_order: 4 })];
    const source = banner({
      link_url: "https://example.com",
      cta_text: "تسوق",
      cta_label_ar: "تسوق",
      action_type: "url",
      action: { type: "url", url: "https://example.com", target: null },
      is_default: true,
      default_priority: 3,
    });
    const copy = duplicateBody(source, nextSortOrder(list));
    expect(copy).toMatchObject({
      is_active: false,
      is_default: false,
      default_priority: 0,
      sort_order: 5,
      action_type: "url",
      link_url: "https://example.com",
      cta_text: "تسوق",
      title_en: "Winter offers",
    });
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

  it("a move sends the complete new order once, every id exactly once", () => {
    const list = [banner({ id: "a" }), banner({ id: "b" }), banner({ id: "c" })];
    expect(reorderIds(list, 1, -1)).toEqual(["b", "a", "c"]);
    expect(reorderIds(list, 1, 1)).toEqual(["a", "c", "b"]);
    expect(reorderIds(list, 0, -1)).toBeNull();
    expect(reorderIds(list, 2, 1)).toBeNull();
  });
});

describe("category targets", () => {
  it("lists the tree with paths, hidden parents hiding their children", () => {
    const options = categoryOptions([
      { id: "d", name_ar: "رجال", name_en: "Men", is_visible: false, children: [{ id: "c", name_ar: "أحذية", name_en: "Shoes", is_visible: true }] },
      { id: "e", name_ar: "مطبخ", name_en: "Kitchen", is_visible: true },
    ]);
    expect(options).toEqual([
      { id: "d", name_ar: "رجال", name_en: "Men", path_ar: "رجال", path_en: "Men", visible: false },
      { id: "c", name_ar: "أحذية", name_en: "Shoes", path_ar: "رجال › أحذية", path_en: "Men › Shoes", visible: false },
      { id: "e", name_ar: "مطبخ", name_en: "Kitchen", path_ar: "مطبخ", path_en: "Kitchen", visible: true },
    ]);
  });
});

describe("orphan uploads", () => {
  it("finds the media id in a stable media URL", () => {
    const id = "0b7c9f7e-3c55-4f27-9c55-0d6c3c0d1a2b";
    expect(mediaIdFromUrl(`http://localhost:8000/api/v1/media/${id}`)).toBe(id);
    expect(mediaIdFromUrl(`https://cdn.example/media/${id}/`)).toBe(id);
    expect(mediaIdFromUrl("https://example.com/picture.png")).toBeNull();
    expect(mediaIdFromUrl(null)).toBeNull();
  });

  it("deletes only what the saved record does not keep", () => {
    expect(orphanedUploads(["u1", "u2", "u2"], ["u2", null])).toEqual(["u1"]);
    expect(orphanedUploads(["u1"], [])).toEqual(["u1"]);
    expect(orphanedUploads([], ["u1"])).toEqual([]);
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

  it("shows a missing translation as empty (admin reads are raw) and an unrelated edit sends nothing", () => {
    const original = category({ description_en: null });
    expect(descriptionDraft(original)).toEqual({ ar: "كل ما تحتاجه لمطبخك", en: "" });
    expect(descriptionChanges(original, descriptionDraft(original))).toEqual({});
    // Identical text in both languages is a real stored value, not a guess.
    const same = category();
    expect(descriptionChanges(same, descriptionDraft(same))).toEqual({});
  });

  it("clears with null and keeps the text exactly as typed", () => {
    const original = category({ description_en: "Everything for your kitchen" });
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
