import type {
  Brand,
  Category,
  Coupon,
  Product,
  ProductAvailability,
  ProductImage,
  Review,
  StoreSettings,
} from "./api";

/* ---------------------------------------------------------------------------
 * Phase-1 fixtures. Contents mirror the design sheet's mockup screens so the
 * style guide shows realistic Arabic copy and prices. Delete this file once the
 * backend serves /settings, /categories and /products for real.
 * ------------------------------------------------------------------------- */

/** Defaults are the Shubayr brand; a tenant overrides these via GET /settings. */
export const mockSettings: StoreSettings = {
  store_name: "Shubayr",
  logo_url: "/logo.svg",
  primary_color: "#558464",
  // The mockup prices read $89 / $299, so the demo tenant is USD. Real Iraqi
  // deployments set IQD here — nothing in the code assumes a currency.
  currency: "USD",
};

/**
 * Brands are their own entity (catalog v2), never extra category levels. One
 * is hidden, as the admin can hide a brand that still has products.
 */
function brand(
  id: string,
  name_en: string,
  name_ar: string,
  sort_order: number,
  is_visible = true,
): Brand {
  return {
    id,
    name_en,
    name_ar,
    slug: id.replace(/^brand-/, ""),
    logo_url: null,
    is_visible,
    sort_order,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
  };
}

export const mockBrands: Brand[] = [
  brand("brand-sonic", "Sonic", "سونيك", 0),
  brand("brand-nova", "Nova", "نوفا", 1),
  brand("brand-atlas", "Atlas", "أطلس", 2),
  brand("brand-luma", "Luma", "لوما", 3),
  brand("brand-retired", "Retired", "متوقفة", 4, false),
];

/** `icon` holds a lucide-react icon name; the UI maps it to a component. */
export const mockCategories: Category[] = [
  {
    id: "c1",
    parent_id: null,
    slug: "electronics",
    name_ar: "إلكترونيات",
    name_en: "Electronics",
    icon_key: "electronics",
    sort_order: 1,
    is_visible: true,
    children: [
      {
        id: "c1-phones",
        parent_id: "c1",
        slug: "phones",
        name_ar: "الهواتف والأجهزة اللوحية",
        name_en: "Phones & Tablets",
        icon_key: "electronics",
        sort_order: 1,
        is_visible: true,
        // A legacy third level, as an older tree might still hold one. The
        // storefront must never render or route to it (catalog v2 is two
        // levels); in the Web Admin it is a candidate for "convert to brand".
        children: [
          {
            id: "c1-phones-legacy",
            parent_id: "c1-phones",
            slug: "legacy-third-level",
            name_ar: "مستوى ثالث قديم",
            name_en: "Legacy third level",
            icon_key: null,
            sort_order: 1,
            is_visible: true,
            children: [],
          },
        ],
      },
      {
        id: "c1-audio",
        parent_id: "c1",
        slug: "audio",
        name_ar: "السماعات والصوتيات",
        name_en: "Headphones & Audio",
        icon_key: "audio",
        sort_order: 2,
        is_visible: true,
        children: [],
      },
      {
        id: "c1-computers",
        parent_id: "c1",
        slug: "computers",
        name_ar: "الحواسيب وملحقاتها",
        name_en: "Computers & Accessories",
        icon_key: "computers",
        sort_order: 3,
        is_visible: true,
        children: [],
      },
      {
        id: "c1-accessories",
        parent_id: "c1",
        slug: "cameras-accessories",
        name_ar: "الكاميرات والإكسسوارات",
        name_en: "Cameras & Accessories",
        icon_key: "Camera",
        sort_order: 4,
        is_visible: true,
        children: [],
      },
    ],
  },
  {
    id: "c2",
    parent_id: null,
    slug: "home-kitchen",
    name_ar: "المنزل والمطبخ",
    name_en: "Home & Kitchen",
    icon_key: "home_garden",
    sort_order: 2,
    is_visible: true,
    children: [],
  },
  {
    id: "c3",
    parent_id: null,
    slug: "fashion",
    name_ar: "الملابس والأزياء",
    name_en: "Clothing & Fashion",
    icon_key: "fashion",
    sort_order: 3,
    is_visible: true,
    children: [],
  },
  {
    id: "c4",
    parent_id: null,
    slug: "beauty",
    name_ar: "الجمال والعناية",
    name_en: "Beauty & Care",
    icon_key: "beauty",
    sort_order: 4,
    is_visible: true,
    children: [],
  },
  {
    id: "c5",
    parent_id: null,
    slug: "sports",
    name_ar: "الرياضة واللياقة",
    name_en: "Sports & Fitness",
    icon_key: "sports",
    sort_order: 5,
    is_visible: true,
    children: [],
  },
  {
    id: "c6",
    parent_id: null,
    slug: "games",
    name_ar: "الألعاب والهوايات",
    name_en: "Games & Hobbies",
    icon_key: "gaming",
    sort_order: 6,
    is_visible: true,
    children: [],
  },
  {
    id: "c7",
    parent_id: null,
    slug: "tools",
    name_ar: "الأدوات والمعدات",
    name_en: "Tools & Equipment",
    icon_key: "tools",
    sort_order: 7,
    is_visible: true,
    children: [],
  },
  {
    id: "c8",
    parent_id: null,
    slug: "books",
    name_ar: "الكتب والقرطاسية",
    name_en: "Books & Stationery",
    icon_key: "books",
    sort_order: 8,
    is_visible: true,
    children: [],
  },
];

/**
 * review_count is fixture-only; real counts come from the reviews Pagination
 * envelope. Everything else mirrors Product, including the fields the backend
 * computes at read time.
 */
export interface DemoProduct extends Omit<
  Product,
  "price" | "rating_avg" | "on_sale" | "effective_price"
> {
  // The contract marks these optional; every fixture sets them, so narrow to
  // plain numbers and keep the display components free of null-checks.
  price: number;
  rating_avg: number;
  review_count: number;
  on_sale: boolean;
  effective_price: number;
}

/** Stable public product photographs, shared by related fixture variants. */
const photographs = {
  headphones: "photo-1505740420928-5e560c06d30e",
  phone: "photo-1511707171634-5f897ff02aa9",
  watch: "photo-1523275335684-37898b6baf30",
  laptop: "photo-1496181133206-80ce9b88a853",
  camera: "photo-1516035069371-29a1b244cc32",
  earbuds: "photo-1606220945770-b5b6c2c55bf1",
  coffee: "photo-1517668808822-9ebb02f2a0e6",
  sofa: "photo-1555041469-a586c61ea9bc",
  shirt: "photo-1521572163474-6864f9cf17ab",
  shoes: "photo-1542291026-7eec264c27ff",
  skincare: "photo-1556229010-6c3f2c9ca5f8",
  books: "photo-1495446815901-a7297e633e8d",
} as const;

/**
 * Stands in for the backend, so it stores the same thing the backend stores —
 * a regular `price` plus a discount definition — and derives the four computed
 * fields exactly as the contract describes. Fixtures are still authored as
 * "what the shopper pays" plus an optional regular price, which is the way the
 * catalogue reads on the page.
 */
/**
 * A ProductImage as the contract shapes it. `is_primary` is read-only and true
 * exactly for the first image, so the fixture derives it rather than storing a
 * second source of truth.
 */
function productImage(
  id: string,
  url: string,
  sort_order: number,
): ProductImage {
  return { id, url, sort_order, is_primary: sort_order === 0 };
}

function demo(
  id: string,
  category_id: string,
  name_ar: string,
  name_en: string,
  /** What the shopper pays; the regular price when there is no discount. */
  paidPrice: number,
  rating_avg: number,
  review_count: number,
  /** Regular price when this product is discounted; null when it is not. */
  regularPrice: number | null = null,
  photograph?: keyof typeof photographs,
): DemoProduct {
  const onSale = regularPrice !== null && regularPrice > paidPrice;
  const price = onSale ? regularPrice : paidPrice;

  return {
    id,
    category_id,
    name_ar,
    name_en,
    description: `${name_ar} بجودة عالية للاستخدام اليومي، من تشكيلة شبير المختارة.`,
    price,
    // Fixtures express the discount as a currency amount off the regular price.
    discount_type: onSale ? "amount" : null,
    discount_value: onSale ? Math.round((price - paidPrice) * 100) / 100 : null,
    // No fixture schedules a discount, so both bounds stay open.
    discount_starts_at: null,
    discount_ends_at: null,
    tracks_expiry: false,
    rating_avg,
    status: "active",
    in_stock: true,
    availability: "in_stock",
    available_qty: 24,
    // Contract v4 carries ProductImage objects, not bare URLs.
    images: photograph
      ? [
          productImage(
            `${id}-img-1`,
            `https://images.unsplash.com/${photographs[photograph]}?auto=format&fit=crop&w=640&q=80`,
            0,
          ),
        ]
      : [],
    variants: [],
    review_count,
    // Computed at read time by the backend; mirrored here so the storefront
    // can trust them exactly as it trusts the real API.
    on_sale: onSale,
    discounted_price: onSale ? paidPrice : null,
    effective_price: onSale ? paidPrice : price,
    discount_percent: onSale
      ? Math.round(((price - paidPrice) / price) * 100)
      : null,
  };
}

export const demoProducts: DemoProduct[] = [
  demo(
    "p1",
    "c1",
    "سماعات لاسلكية",
    "Wireless headphones",
    89,
    4.6,
    98,
    149,
    "headphones",
  ),
  demo("p2", "c1", "هاتف ذكي", "Smartphone", 299, 4.8, 124, null, "phone"),
  demo("p3", "c1", "ساعة ذكية", "Smart watch", 129, 4.7, 76, null, "watch"),
  demo("p4", "c1", "لابتوب", "Laptop", 799, 4.8, 210, null, "laptop"),
  demo(
    "p5",
    "c1",
    "كاميرا رقمية",
    "Digital camera",
    449,
    4.5,
    63,
    599,
    "camera",
  ),
  demo(
    "p6",
    "c1",
    "سماعات أذن لاسلكية",
    "Wireless earbuds",
    59,
    4.4,
    187,
    99,
    "earbuds",
  ),
  demo("p7", "c2", "آلة قهوة", "Coffee machine", 199, 4.7, 142, null, "coffee"),
  demo("p8", "c2", "خلاط كهربائي", "Electric blender", 75, 4.3, 88, 110),
  demo("p9", "c2", "أريكة قماشية", "Fabric sofa", 649, 4.6, 41, null, "sofa"),
  demo("p10", "c3", "قميص قطني", "Cotton shirt", 35, 4.2, 256, null, "shirt"),
  demo("p11", "c3", "حذاء رياضي", "Running shoes", 120, 4.8, 312, 180, "shoes"),
  demo(
    "p12",
    "c4",
    "طقم عناية بالبشرة",
    "Skincare set",
    68,
    4.9,
    174,
    null,
    "skincare",
  ),
  demo("p13", "c5", "دمبل معدني", "Metal dumbbell", 45, 4.5, 97),
  demo("p14", "c5", "سجادة يوغا", "Yoga mat", 29, 4.4, 133, 49),
  demo("p15", "c6", "ذراع تحكم", "Game controller", 65, 4.7, 205),
  demo("p16", "c7", "مثقاب كهربائي", "Power drill", 139, 4.6, 78, 189),
  demo(
    "p17",
    "c1",
    "سماعات استوديو",
    "Studio headphones",
    119,
    4.8,
    84,
    179,
    "headphones",
  ),
  demo(
    "p18",
    "c1",
    "هاتف ذكي برو",
    "Smartphone Pro",
    549,
    4.9,
    156,
    null,
    "phone",
  ),
  demo(
    "p19",
    "c1",
    "ساعة رياضية ذكية",
    "Sport smart watch",
    79,
    4.3,
    65,
    119,
    "watch",
  ),
  demo(
    "p20",
    "c1",
    "لابتوب للعمل والدراسة",
    "Work and study laptop",
    599,
    4.6,
    112,
    749,
    "laptop",
  ),
  demo(
    "p21",
    "c1",
    "كاميرا للسفر",
    "Travel camera",
    329,
    4.4,
    47,
    null,
    "camera",
  ),
  demo(
    "p22",
    "c1",
    "سماعات أذن ميني",
    "Mini wireless earbuds",
    39,
    3.8,
    93,
    59,
    "earbuds",
  ),
  demo(
    "p23",
    "c1",
    "سماعات بعزل الضوضاء",
    "Noise cancelling headphones",
    159,
    4.9,
    231,
    219,
    "headphones",
  ),
  demo(
    "p24",
    "c1",
    "لابتوب خفيف",
    "Lightweight laptop",
    899,
    4.7,
    89,
    null,
    "laptop",
  ),
  demo(
    "p25",
    "c1",
    "ساعة ذكية كلاسيكية",
    "Classic smart watch",
    99,
    4.2,
    58,
    null,
    "watch",
  ),
  demo(
    "p26",
    "c1",
    "سماعات لاسلكية بلس",
    "Wireless headphones Plus",
    89,
    4.6,
    98,
    149,
    "headphones",
  ),
  demo(
    "p27",
    "c1-phones",
    "هاتف ذكي بذاكرة واسعة",
    "High capacity smartphone",
    349,
    4.6,
    83,
    449,
    "phone",
  ),
  demo(
    "p28",
    "c1-phones",
    "هاتف ذكي ميني",
    "Smartphone Mini",
    229,
    4.1,
    51,
    null,
    "phone",
  ),
  demo(
    "p29",
    "c1-audio",
    "سماعات لاسلكية احترافية",
    "Professional wireless headphones",
    129,
    4.8,
    165,
    199,
    "headphones",
  ),
  demo(
    "p30",
    "c1-audio",
    "سماعات أذن رياضية",
    "Sport wireless earbuds",
    69,
    4.2,
    118,
    null,
    "earbuds",
  ),
  demo(
    "p31",
    "c1-computers",
    "لابتوب احترافي",
    "Professional laptop",
    1099,
    4.9,
    105,
    1299,
    "laptop",
  ),
  demo(
    "p32",
    "c1-computers",
    "لابتوب يومي",
    "Everyday laptop",
    449,
    4.0,
    73,
    null,
    "laptop",
  ),
  demo(
    "p33",
    "c1-accessories",
    "كاميرا تصوير احترافية",
    "Professional camera",
    699,
    4.8,
    64,
    899,
    "camera",
  ),
  demo(
    "p34",
    "c1-accessories",
    "ساعة ذكية ميني",
    "Mini smart watch",
    59,
    4.1,
    92,
    null,
    "watch",
  ),
  demo(
    "p35",
    "c8",
    "مجموعة كتب مختارة",
    "Selected books collection",
    39,
    4.7,
    54,
    55,
    "books",
  ),
];

/**
 * A SKU sold by weight: quantities take up to three decimals of a kilogram,
 * and its price is per kilogram.
 */
demoProducts.push(
  demo("p36", "c2", "أرز بسمتي", "Basmati rice", 3, 4.6, 28),
);

/** Which brand each fixture belongs to, by what it is. */
const BRAND_BY_PHOTOGRAPH: Partial<Record<keyof typeof photographs, string>> = {
  headphones: "brand-sonic",
  earbuds: "brand-sonic",
  phone: "brand-nova",
  watch: "brand-nova",
  laptop: "brand-atlas",
  camera: "brand-atlas",
};

for (const product of demoProducts) {
  const url = product.images?.[0]?.url ?? "";
  const kind = (
    Object.keys(photographs) as Array<keyof typeof photographs>
  ).find((key) => url.includes(photographs[key]));
  // p13 belongs to the hidden brand: still sold, never offered as a filter.
  const brandId =
    product.id === "p13"
      ? "brand-retired"
      : (kind && BRAND_BY_PHOTOGRAPH[kind]) || "brand-luma";
  const found = mockBrands.find((item) => item.id === brandId) ?? null;
  product.brand_id = found?.id ?? null;
  product.brand = found;
}

/** Contract-shaped view of the same fixtures, used by the API client. */
export const mockProducts: Product[] = demoProducts;

/** Existing localized carousel view model; api.getBanners maps the contract. */

export interface Banner {
  id: string;
  title_ar: string;
  title_en: string;
  subtitle_ar: string;
  subtitle_en: string;
  cta_ar: string;
  cta_en: string;
  href: string;
  /** Optional artwork; the banner falls back to the brand gradient without it. */
  image_url: string | null;
}

export const mockBanners: Banner[] = [
  {
    id: "b1",
    title_ar: "عروض مميزة",
    title_en: "Featured offers",
    subtitle_ar: "حتى 40%",
    subtitle_en: "Up to 40% off",
    cta_ar: "تسوق الآن",
    cta_en: "Shop now",
    href: "/category/electronics?on_sale=true",
    image_url: null,
  },
  {
    id: "b2",
    title_ar: "وصل حديثًا",
    title_en: "Just arrived",
    subtitle_ar: "أحدث الإلكترونيات",
    subtitle_en: "The latest electronics",
    cta_ar: "اكتشف الجديد",
    cta_en: "Discover new",
    href: "/category/electronics?sort=newest",
    image_url: null,
  },
  {
    id: "b3",
    title_ar: "كل ما يحتاجه منزلك",
    title_en: "Everything for your home",
    subtitle_ar: "توصيل مجاني للطلبات فوق $50",
    subtitle_en: "Free delivery over $50",
    cta_ar: "تسوق المنزل",
    cta_en: "Shop home",
    href: "/category/home-kitchen",
    image_url: null,
  },
];

/* ---------------------------------------------------------------------------
 * Product-detail fixtures: variants, per-variant availability, and reviews.
 *
 * These stand in for GET /products/{id}, /availability and /reviews until the
 * backend is live. Shapes follow the contract exactly so swapping USE_MOCKS off
 * changes nothing but the data source.
 * ------------------------------------------------------------------------- */

/**
 * Variant attributes are a free-form object in the contract
 * (`additionalProperties: true`). The storefront reads two conventional keys:
 * `color` (rendered as a swatch, with `color_hex` for the chip) and `size`
 * (rendered as a labelled option). Anything else falls back to a plain chip, so
 * a new attribute the backend invents still renders sensibly.
 */
type VariantSeed = {
  id: string;
  sku: string;
  /** Fixed-price override; null inherits the product's regular price. */
  selling_price: number | null;
  qty: number;
  attributes: Record<string, string>;
  base_unit?: string;
  whole_units_only?: boolean;
  /** Null inherits the store default below. */
  low_stock_threshold?: number | null;
};

/** The store default low-stock threshold, in each SKU's base unit. */
const DEFAULT_LOW_STOCK_THRESHOLD = 5;

const VARIANT_SEEDS: Record<string, VariantSeed[]> = {
  // The design sheet's product screen: three colour swatches, black selected.
  // Green and grey carry their own price — a per-SKU override.
  p1: [
    { id: "p1-black", sku: "WH-BLK", selling_price: null, qty: 12, attributes: { color: "أسود", color_en: "Black", color_hex: "#1F2937" } },
    { id: "p1-green", sku: "WH-GRN", selling_price: 159, qty: 4, attributes: { color: "أخضر", color_en: "Green", color_hex: "#558464" } },
    { id: "p1-gray", sku: "WH-GRY", selling_price: 159, qty: 0, attributes: { color: "رمادي", color_en: "Gray", color_hex: "#9CA3AF" } },
  ],
  p11: [
    { id: "p11-40", sku: "SH-40", selling_price: null, qty: 6, attributes: { size: "40" } },
    { id: "p11-42", sku: "SH-42", selling_price: null, qty: 2, attributes: { size: "42" } },
    { id: "p11-44", sku: "SH-44", selling_price: 185, qty: 0, attributes: { size: "44" } },
  ],
  // By the kilogram: 7.5 kg left against a 10 kg threshold reads low stock.
  p36: [
    { id: "p36-kg", sku: "RICE-KG", selling_price: null, qty: 7.5, attributes: {}, base_unit: "kg", whole_units_only: false, low_stock_threshold: 10 },
  ],
};

function levelFor(qty: number, threshold: number) {
  if (qty <= 0) return "out_of_stock" as const;
  return qty <= threshold ? ("low_stock" as const) : ("in_stock" as const);
}

function thresholdOf(seed: VariantSeed): number {
  return seed.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
}

/**
 * Attach the seeded variants to their products, priced the way the backend
 * prices a SKU: its own override (else the product price), then the product
 * discount on top.
 */
for (const product of demoProducts) {
  const seeds = VARIANT_SEEDS[product.id ?? ""];
  if (!seeds) continue;
  product.variants = seeds.map((seed) => {
    const regular = seed.selling_price ?? product.price;
    const off = product.on_sale ? (product.discount_value ?? 0) : 0;
    const discounted = product.on_sale ? regular - off : null;
    return {
      id: seed.id,
      sku: seed.sku,
      attributes: seed.attributes,
      price_delta: regular - product.price,
      currency: "USD",
      base_unit: seed.base_unit ?? "piece",
      whole_units_only: seed.whole_units_only ?? true,
      selling_price: seed.selling_price,
      low_stock_threshold: seed.low_stock_threshold ?? null,
      pricing_mode: "fixed" as const,
      reference_currency_code: null,
      reference_price: null,
      published_price: null,
      on_sale: product.on_sale,
      discounted_price: discounted,
      effective_price: discounted ?? regular,
      discount_percent: product.on_sale
        ? Math.round((off / regular) * 100)
        : null,
      available_qty: seed.qty,
      availability: levelFor(seed.qty, thresholdOf(seed)),
      in_stock: seed.qty > 0,
    };
  });
  const total = seeds.reduce((sum, seed) => sum + seed.qty, 0);
  product.available_qty = total;
  product.in_stock = total > 0;
  product.availability = seeds.some(
    (seed) => levelFor(seed.qty, thresholdOf(seed)) === "in_stock",
  )
    ? "in_stock"
    : total > 0
      ? "low_stock"
      : "out_of_stock";
}

// p1 is the design-sheet product: give it a small gallery.
const headphones = demoProducts.find((p) => p.id === "p1");
if (headphones) {
  headphones.images = [
    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=1200&q=80",
  ].map((url, index) => productImage(`p1-img-${index + 1}`, url, index));
  headphones.description =
    "سماعات لاسلكية عالية الجودة مع عزل ضوضاء ووقت تشغيل طويل للبطارية.";
}

/** Availability derived from the seeds, matching ProductAvailability. */
export function mockAvailabilityFor(
  product: DemoProduct,
): ProductAvailability {
  const seeds = VARIANT_SEEDS[product.id ?? ""];
  if (!seeds) {
    return {
      product_id: product.id,
      in_stock: product.in_stock ?? true,
      availability: product.availability ?? "in_stock",
      available_qty: product.available_qty ?? 0,
      variants: [],
    };
  }
  return {
    product_id: product.id,
    in_stock: product.in_stock,
    availability: product.availability,
    available_qty: product.available_qty,
    variants: seeds.map((seed) => ({
      variant_id: seed.id,
      sku: seed.sku,
      base_unit: seed.base_unit ?? "piece",
      whole_units_only: seed.whole_units_only ?? true,
      low_stock_threshold: thresholdOf(seed),
      available_qty: seed.qty,
      availability: levelFor(seed.qty, thresholdOf(seed)),
      in_stock: seed.qty > 0,
    })),
  };
}

const REVIEW_COMMENTS = [
  "جودة الصوت ممتازة وعزل الضوضاء يعمل بشكل رائع. البطارية تدوم طوال اليوم.",
  "المنتج مطابق للوصف والتوصيل كان سريعًا. أنصح به.",
  "مريحة جدًا للاستخدام الطويل، لكن السعر مرتفع قليلًا.",
  "استخدمها يوميًا في العمل ولم أواجه أي مشكلة حتى الآن.",
  "التغليف ممتاز والجودة تستحق السعر.",
  "جيدة بشكل عام، لكن كنت أتوقع صوتًا أعمق قليلًا.",
  "أفضل شراء هذا العام. الصوت نقي جدًا.",
];

/**
 * Deterministic reviews so the page renders the same set on every request —
 * a random fixture would make the server and client markup disagree.
 */
export function mockReviewsFor(productId: string): Review[] {
  const product = demoProducts.find((item) => item.id === productId);
  if (!product) return [];

  const count = Math.min(product.review_count, 12);
  return Array.from({ length: count }, (_, index) => {
    // Skew toward the product's average so the distribution bars look real.
    const offset = [0, 0, 0, -1, 1, -2][index % 6];
    const rating = Math.max(1, Math.min(5, Math.round(product.rating_avg) + offset));
    const daysAgo = index * 6 + 2;
    return {
      id: `${productId}-r${index + 1}`,
      product_id: productId,
      user_id: `u${(index % 7) + 1}`,
      order_item_id: index % 4 === 3 ? null : `oi-${productId}-${index}`,
      rating,
      comment: REVIEW_COMMENTS[index % REVIEW_COMMENTS.length],
      // Only reviews tied to a real order item count as verified purchases,
      // which is the rule the contract enforces on POST.
      verified_purchase: index % 4 !== 3,
      status: "published" as const,
      created_at: new Date(
        Date.UTC(2026, 7, 1) - daysAgo * 86_400_000,
      ).toISOString(),
    };
  });
}

/* ---------------------------------------------------------------------------
 * Checkout fixtures.
 * ------------------------------------------------------------------------- */

/**
 * The coupons the mock backend accepts. Every other code — unknown, mistyped or
 * expired — comes back as a 404, which is the only failure POST
 * /coupons/validate defines, so the UI has one rejection path to handle.
 */
export const mockCoupons: Coupon[] = [
  { code: "SHUBAYR10", type: "percentage", value: 10, currency: "IQD" },
  { code: "WELCOME5", type: "fixed", value: 5, currency: "IQD" },
];

export function mockCouponFor(code: string): Coupon | undefined {
  const needle = code.trim().toUpperCase();
  return mockCoupons.find((coupon) => coupon.code?.toUpperCase() === needle);
}

/**
 * Order numbers the mockup shows as SB-1042. The counter is per browser tab,
 * which is all a fixture needs — the backend owns the real sequence.
 */
let orderSequence = 1041;

export function nextMockOrderNumber(): string {
  orderSequence += 1;
  return `SB-${orderSequence}`;
}
