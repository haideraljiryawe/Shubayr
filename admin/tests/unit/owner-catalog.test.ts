import { describe, expect, it } from "vitest";
import {
  attributeRows,
  attributesFromRows,
  copySku,
  emptyDraft,
  englishOrArabic,
  nextDraft,
  slugFor,
  suggestSkus,
  transliterate,
  uniqueSlug,
  variantInput,
  type Product,
} from "@/lib/catalog";
import { firstDayComplete, firstDaySteps, type FirstDayFacts } from "@/lib/first-day";
import { MODULES, isRouteEnabled, parseModules, routeModule } from "@/lib/modules";
import { NAV_ITEMS, visibleNav } from "@/lib/nav";
import {
  checkImageFile,
  creationImages,
  draftsFromImages,
  fitWithin,
  imagesSettled,
  makeMain,
  mediaOperations,
  moveItem,
  needsCompression,
  type ImageDraft,
  type MediaOperation,
  type ProductImage,
} from "@/lib/product-images";
import {
  bulkPatch,
  bulkTargets,
  localFilters,
  matchesLocalFilters,
  pageOf,
  primaryImage,
} from "@/lib/product-list";

/* ------------------------------------------------------------ modules */

describe("admin modules (ADMIN_MODULES)", () => {
  it("shows everything when unset, empty, 'all', or only unknown keys", () => {
    for (const raw of [undefined, null, "", "  ", "all", "ALL", "nonsense,typo"]) {
      expect(parseModules(raw)).toEqual([...MODULES]);
    }
  });

  it("keeps the known keys of a launch configuration", () => {
    expect(parseModules("catalog, stock,orders settings,users,bogus")).toEqual([
      "catalog",
      "stock",
      "orders",
      "settings",
      "users",
    ]);
  });

  it("puts each route under its module, nested prefixes first", () => {
    expect(routeModule("/catalog/products/abc")).toBe("catalog");
    expect(routeModule("/inventory/openings/new")).toBe("stock");
    expect(routeModule("/finance/custody-exceptions/1")).toBe("custody");
    expect(routeModule("/finance/cash-receipts")).toBe("cashReceipts");
    // A below-cost price approval belongs to the catalog it came from.
    expect(routeModule("/finance/price-approvals/1")).toBe("catalog");
    expect(routeModule("/finance/ledger")).toBe("finance");
    expect(routeModule("/deliveries/trips/new")).toBe("trips");
    expect(routeModule("/delivery-parties/custody")).toBe("deliveryParties");
    expect(routeModule("/retrievals")).toBe("orders");
    expect(routeModule("/")).toBeNull();
    expect(routeModule("/notifications")).toBeNull();
    // A prefix only matches whole segments.
    expect(routeModule("/catalogue")).toBeNull();
  });

  it("hides the delivery add-ons in the launch configuration", () => {
    const launch = parseModules("catalog,stock,orders,settings,users");
    expect(isRouteEnabled("/catalog/products", launch)).toBe(true);
    expect(isRouteEnabled("/orders/1", launch)).toBe(true);
    expect(isRouteEnabled("/delivery-parties", launch)).toBe(false);
    expect(isRouteEnabled("/deliveries/trips", launch)).toBe(false);
    expect(isRouteEnabled("/finance/custody-exceptions", launch)).toBe(false);
    expect(isRouteEnabled("/finance/cash-receipts", launch)).toBe(false);
    expect(isRouteEnabled("/", launch)).toBe(true);
    expect(isRouteEnabled("/module-disabled", launch)).toBe(true);

    const all = NAV_ITEMS.flatMap((item) => item.requires);
    const keys = visibleNav(all, undefined, launch).map((item) => item.key);
    expect(keys).toEqual([
      "dashboard",
      "products",
      "categories",
      "brands",
      "stock",
      "openings",
      "movements",
      "warehouses",
      "transfers",
      "counts",
      "writeDowns",
      "orders",
      "settings",
      "staff",
      "presets",
      "workPhones",
    ]);
    // Without a module list, permissions alone decide (every entry here).
    expect(visibleNav(all)).toHaveLength(NAV_ITEMS.length);
  });
});

/* ------------------------------------------------------------ first day */

describe("first-day checklist", () => {
  const owner: FirstDayFacts = {
    permissions: ["catalog.categories", "catalog.brands", "catalog.products", "inventory.view", "inventory.manage"],
    modules: [...MODULES],
    subcategoryCount: 0,
    brandCount: 0,
    productCount: 0,
    openingCount: 0,
    sellableLocations: 1,
  };

  it("lists the four steps in order, brands optional", () => {
    const steps = firstDaySteps(owner);
    expect(steps.map((step) => [step.key, step.done, step.optional])).toEqual([
      ["categories", false, false],
      ["brands", false, true],
      ["product", false, false],
      ["stock", false, false],
    ]);
    expect(steps.find((step) => step.key === "product")?.href).toBe("/catalog/products/new");
    expect(firstDayComplete(steps)).toBe(false);
  });

  it("is complete without the optional brand step", () => {
    const steps = firstDaySteps({ ...owner, subcategoryCount: 2, productCount: 1, openingCount: 1 });
    expect(firstDayComplete(steps)).toBe(true);
    expect(steps.find((step) => step.key === "product")?.href).toBe("/catalog/products");
  });

  it("sends the stock step to warehouses when no location can take stock", () => {
    const stock = firstDaySteps({ ...owner, sellableLocations: 0 }).find((step) => step.key === "stock");
    expect(stock).toMatchObject({ href: "/inventory/warehouses", blockedBy: "location" });
  });

  it("leaves out what the person may not read or what is switched off", () => {
    expect(firstDaySteps({ ...owner, permissions: ["catalog.products"] }).map((step) => step.key)).toEqual(["product"]);
    expect(firstDaySteps({ ...owner, brandCount: null }).map((step) => step.key)).not.toContain("brands");
    expect(firstDaySteps({ ...owner, modules: ["catalog"] }).map((step) => step.key)).not.toContain("stock");
  });
});

/* ------------------------------------------------------------ images */

const stored = (ids: string[]): ProductImage[] =>
  ids.map((id, index) => ({ id, url: `https://api.test/media/${id}`, sort_order: index, is_primary: index === 0 }));

const ready = (key: string, imageId?: string): ImageDraft => ({
  key,
  imageId,
  url: `https://api.test/media/${imageId ?? key}`,
  preview: "blob:x",
  phase: "ready",
  progress: 100,
});

/** Apply operations exactly as the API's applyMediaOperations does. */
function apply(start: ProductImage[], operations: MediaOperation[]): string[] {
  const list = start.map((image) => image.url);
  const ids = start.map((image) => image.id as string | null);
  for (const op of operations) {
    if (op.op === "add") {
      expect(op.position).toBeLessThanOrEqual(list.length);
      list.splice(op.position, 0, op.url);
      ids.splice(op.position, 0, null);
      continue;
    }
    const index = ids.indexOf(op.image_id);
    expect(index).toBeGreaterThanOrEqual(0);
    if (op.op === "remove") {
      list.splice(index, 1);
      ids.splice(index, 1);
    }
    if (op.op === "move") {
      expect(op.position).toBeLessThan(list.length);
      const [url] = list.splice(index, 1);
      const [id] = ids.splice(index, 1);
      list.splice(op.position, 0, url);
      ids.splice(op.position, 0, id);
    }
  }
  return list;
}

describe("product images", () => {
  it("reads stored images in their order", () => {
    const drafts = draftsFromImages([
      { id: "b", url: "https://api.test/b", sort_order: 1, is_primary: false },
      { id: "a", url: "https://api.test/a", sort_order: 0, is_primary: true },
    ]);
    expect(drafts.map((draft) => draft.imageId)).toEqual(["a", "b"]);
    expect(drafts.every((draft) => draft.phase === "ready")).toBe(true);
  });

  it("moves, and makes a picture the main one", () => {
    expect(moveItem(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 0, 9)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
    const list = [ready("a"), ready("b"), ready("c")];
    expect(makeMain(list, "c").map((item) => item.key)).toEqual(["c", "a", "b"]);
    expect(makeMain(list, "a").map((item) => item.key)).toEqual(["a", "b", "c"]);
  });

  it("sends nothing for an untouched list", () => {
    const images = stored(["a", "b", "c"]);
    expect(mediaOperations(images, draftsFromImages(images))).toEqual([]);
  });

  it("removes, adds and moves to reach the order on screen", () => {
    const images = stored(["a", "b", "c", "d"]);
    // Drop b, put d first, add two new pictures (one in the middle, one last).
    const drafts = [ready("d", "d"), ready("n1"), ready("a", "a"), ready("c", "c"), ready("n2")];
    const operations = mediaOperations(images, drafts);
    expect(operations[0]).toEqual({ op: "remove", image_id: "b" });
    expect(apply(images, operations)).toEqual(drafts.map((draft) => draft.url));
  });

  it("reaches every permutation of four images", () => {
    const images = stored(["a", "b", "c", "d"]);
    const permutations = (items: string[]): string[][] =>
      items.length <= 1 ? [items] : items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
    for (const order of permutations(["a", "b", "c", "d"])) {
      const drafts = order.map((id) => ready(id, id));
      expect(apply(images, mediaOperations(images, drafts))).toEqual(drafts.map((draft) => draft.url));
    }
  });

  it("leaves out tiles that are not uploaded", () => {
    const drafts: ImageDraft[] = [ready("a"), { key: "b", preview: "blob:b", phase: "uploading", progress: 40 }];
    expect(creationImages(drafts)).toEqual([{ url: "https://api.test/media/a" }]);
    expect(imagesSettled(drafts)).toBe("busy");
    expect(imagesSettled([ready("a"), { key: "f", preview: "", phase: "failed", progress: 0 }])).toBe("failed");
    expect(imagesSettled([ready("a")])).toBe("ready");
  });

  it("sizes and screens pictures before upload", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(1200, 4800)).toEqual({ width: 400, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(needsCompression(4000, 3000, 100_000)).toBe(true);
    expect(needsCompression(1000, 800, 2_000_000)).toBe(true);
    expect(needsCompression(1000, 800, 200_000)).toBe(false);
    expect(checkImageFile({ type: "image/jpeg", size: 20_000_000 })).toBeNull();
    expect(checkImageFile({ type: "image/heic", size: 1000 })).toBe("type");
    expect(checkImageFile({ type: "image/gif", size: 1000 })).toBe("type");
  });
});

/* ------------------------------------------------------------ list + bulk */

const product = (patch: Partial<Product>): Product => ({
  id: "p",
  category_id: "c1",
  name_ar: "منتج",
  name_en: "Product",
  status: "hidden",
  availability: "out_of_stock",
  ...patch,
});

describe("product list filters and bulk actions", () => {
  it("reads only known status and stock filters", () => {
    expect(localFilters({ status: "active", stock: "low_stock", image: "with" })).toEqual({ status: "active", stock: "low_stock", image: "with" });
    expect(localFilters({ status: "draft", stock: "plenty", image: "maybe" })).toEqual({ status: null, stock: null, image: null });
  });

  it("matches status and stock", () => {
    const filters = { status: "active" as const, stock: "in_stock" as const, image: null };
    expect(matchesLocalFilters(product({ status: "active", availability: "in_stock" }), filters)).toBe(true);
    expect(matchesLocalFilters(product({ status: "hidden", availability: "in_stock" }), filters)).toBe(false);
    expect(matchesLocalFilters(product({ status: "active", availability: "low_stock" }), filters)).toBe(false);
    expect(matchesLocalFilters(product({}), { status: null, stock: null, image: null })).toBe(true);
    expect(matchesLocalFilters(product({ images: [] }), { status: null, stock: null, image: "without" })).toBe(true);
  });

  it("pages a filtered list and clamps past the end", () => {
    const rows = Array.from({ length: 45 }, (_, i) => i);
    expect(pageOf(rows, 2, 20)).toEqual({ rows: rows.slice(20, 40), page: 2 });
    expect(pageOf(rows, 9, 20)).toEqual({ rows: rows.slice(40), page: 3 });
    expect(pageOf([], 3, 20)).toEqual({ rows: [], page: 1 });
  });

  it("turns each bulk action into one PATCH body", () => {
    expect(bulkPatch({ kind: "publish" })).toEqual({ status: "active", published: true });
    expect(bulkPatch({ kind: "hide" })).toEqual({ status: "hidden", published: false });
    expect(bulkPatch({ kind: "category", categoryId: "c2" })).toEqual({ category_id: "c2" });
    expect(bulkPatch({ kind: "brand", brandId: null })).toEqual({ brand_id: null });
  });

  it("skips products the action would not change", () => {
    const rows = [
      product({ id: "1", status: "active", published_at: "2026-10-01T00:00:00Z", category_id: "c2", brand_id: "b1" }),
      product({ id: "2", status: "hidden", category_id: "c1", brand_id: null }),
      product({ id: "3", status: "active", published_at: null, category_id: "c1" }),
    ];
    expect(bulkTargets(rows, { kind: "publish" }).map((row) => row.id)).toEqual(["2", "3"]);
    expect(bulkTargets(rows, { kind: "hide" }).map((row) => row.id)).toEqual(["1", "3"]);
    expect(bulkTargets(rows, { kind: "category", categoryId: "c2" }).map((row) => row.id)).toEqual(["2", "3"]);
    expect(bulkTargets(rows, { kind: "brand", brandId: null }).map((row) => row.id)).toEqual(["1"]);
  });

  it("finds the primary picture by sort order", () => {
    expect(
      primaryImage(
        product({
          images: [
            { id: "2", url: "https://api.test/2", sort_order: 1, is_primary: false },
            { id: "1", url: "https://api.test/1", sort_order: 0, is_primary: true },
          ],
        }),
      ),
    ).toBe("https://api.test/1");
    expect(primaryImage(product({ images: [] }))).toBeNull();
  });
});

/* ------------------------------------------------------------ catalog helpers */

describe("names, slugs and SKU codes for a fast catalog", () => {
  it("writes Arabic in Latin letters for slugs", () => {
    expect(transliterate("هواتف ذكية")).toBe("hwatf dhkya");
    expect(transliterate("شاشة ٥٥")).toBe("shasha 55");
    expect(transliterate("مُكَيِّف")).toBe("mkyf");
    expect(slugFor("", "هواتف ذكية")).toBe("hwatf-dhkya");
    expect(slugFor("Smart Phones", "هواتف ذكية")).toBe("smart-phones");
  });

  it("keeps a suggested slug unique", () => {
    expect(uniqueSlug("accessories", ["phones"])).toBe("accessories");
    expect(uniqueSlug("accessories", ["accessories", "accessories-2"])).toBe("accessories-3");
    expect(uniqueSlug("", [])).toBe("item");
  });

  it("uses the Arabic name when the English one is left empty", () => {
    expect(englishOrArabic("  ", " هاتف ")).toBe("هاتف");
    expect(englishOrArabic("Phone", "هاتف")).toBe("Phone");
  });

  it("reads and writes attribute rows", () => {
    expect(attributeRows({ اللون: "أحمر", size: 42, nested: { x: 1 } })).toEqual([
      { name: "اللون", value: "أحمر" },
      { name: "size", value: "42" },
    ]);
    expect(attributesFromRows([{ name: " اللون ", value: " أحمر " }, { name: "", value: "" }])).toEqual({
      ok: true,
      value: { اللون: "أحمر" },
    });
    expect(attributesFromRows([{ name: "اللون", value: "" }]).ok).toBe(false);
    expect(attributesFromRows([{ name: "", value: "أحمر" }]).ok).toBe(false);
    expect(attributesFromRows([{ name: "a", value: "1" }, { name: "a", value: "2" }]).ok).toBe(false);
    const draft = { ...emptyDraft(), sku: "X", attributes: [{ name: "اللون", value: "أسود" }] };
    expect(variantInput(draft)).toMatchObject({ ok: true, value: { attributes: { اللون: "أسود" } } });
  });

  it("starts a new SKU row like the one before it, without its price", () => {
    const previous = {
      ...emptyDraft("USD"),
      sku: "TEE-RED",
      attributes: [{ name: "اللون", value: "أحمر" }, { name: "", value: "" }],
      base_unit: "kg",
      whole_units_only: false,
      low_stock_threshold: "2.5",
      selling_price: "9000",
      pricing_mode: "linked" as const,
      reference_currency_code: "USD",
    };
    const next = nextDraft(previous, "USD");
    expect(next).toMatchObject({
      sku: "",
      attributes: [{ name: "اللون", value: "" }],
      base_unit: "kg",
      whole_units_only: false,
      low_stock_threshold: "2.5",
      selling_price: "",
      pricing_mode: "linked",
      reference_currency_code: "USD",
    });
    expect(next.key).not.toBe(previous.key);
    expect(nextDraft(undefined).sku).toBe("");
  });

  it("fills empty SKU codes from the name and attributes, never twice", () => {
    const rows = [
      { ...emptyDraft(), attributes: [{ name: "Colour", value: "Black" }] },
      { ...emptyDraft(), sku: "KEEP-ME" },
      { ...emptyDraft(), attributes: [{ name: "Colour", value: "Black" }] },
      { ...emptyDraft() },
    ];
    expect(suggestSkus(rows, "Galaxy A15", "").map((row) => row.sku)).toEqual([
      "GALAXY-A15-BLACK",
      "KEEP-ME",
      "GALAXY-A15-BLACK-2",
      "GALAXY-A15-4",
    ]);
    // An Arabic-only product and Arabic values still give Latin codes.
    expect(suggestSkus([{ ...emptyDraft(), attributes: [{ name: "اللون", value: "أحمر" }] }], "", "قميص")[0].sku).toBe("QMYS-AHMR");
    expect(suggestSkus([emptyDraft()], "", "")[0].sku).toBe("SKU-1");
  });

  it("moves a copied SKU code on by one", () => {
    expect(copySku("TEE-RED")).toBe("TEE-RED-2");
    expect(copySku("TEE-RED-2")).toBe("TEE-RED-3");
    expect(copySku("A".repeat(80))).toHaveLength(80);
  });
});
