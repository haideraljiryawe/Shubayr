import type { Category, Product, StoreSettings } from "./api";

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

/** `icon` holds a lucide-react icon name; the UI maps it to a component. */
export const mockCategories: Category[] = [
  {
    id: "c1",
    parent_id: null,
    slug: "electronics",
    name_ar: "إلكترونيات",
    name_en: "Electronics",
    icon: "Smartphone",
    sort_order: 1,
    is_active: true,
    children: [
      {
        id: "c1-phones",
        parent_id: "c1",
        slug: "phones",
        name_ar: "الهواتف والأجهزة اللوحية",
        name_en: "Phones & Tablets",
        icon: "Smartphone",
        sort_order: 1,
        is_active: true,
        children: [],
      },
      {
        id: "c1-audio",
        parent_id: "c1",
        slug: "audio",
        name_ar: "السماعات والصوتيات",
        name_en: "Headphones & Audio",
        icon: "Headphones",
        sort_order: 2,
        is_active: true,
        children: [],
      },
      {
        id: "c1-computers",
        parent_id: "c1",
        slug: "computers",
        name_ar: "الحواسيب وملحقاتها",
        name_en: "Computers & Accessories",
        icon: "Laptop",
        sort_order: 3,
        is_active: true,
        children: [],
      },
      {
        id: "c1-accessories",
        parent_id: "c1",
        slug: "cameras-accessories",
        name_ar: "الكاميرات والإكسسوارات",
        name_en: "Cameras & Accessories",
        icon: "Camera",
        sort_order: 4,
        is_active: true,
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
    icon: "Sofa",
    sort_order: 2,
    is_active: true,
    children: [],
  },
  {
    id: "c3",
    parent_id: null,
    slug: "fashion",
    name_ar: "الملابس والأزياء",
    name_en: "Clothing & Fashion",
    icon: "Shirt",
    sort_order: 3,
    is_active: true,
    children: [],
  },
  {
    id: "c4",
    parent_id: null,
    slug: "beauty",
    name_ar: "الجمال والعناية",
    name_en: "Beauty & Care",
    icon: "Sparkles",
    sort_order: 4,
    is_active: true,
    children: [],
  },
  {
    id: "c5",
    parent_id: null,
    slug: "sports",
    name_ar: "الرياضة واللياقة",
    name_en: "Sports & Fitness",
    icon: "Dumbbell",
    sort_order: 5,
    is_active: true,
    children: [],
  },
  {
    id: "c6",
    parent_id: null,
    slug: "games",
    name_ar: "الألعاب والهوايات",
    name_en: "Games & Hobbies",
    icon: "Gamepad2",
    sort_order: 6,
    is_active: true,
    children: [],
  },
  {
    id: "c7",
    parent_id: null,
    slug: "tools",
    name_ar: "الأدوات والمعدات",
    name_en: "Tools & Equipment",
    icon: "Drill",
    sort_order: 7,
    is_active: true,
    children: [],
  },
  {
    id: "c8",
    parent_id: null,
    slug: "books",
    name_ar: "الكتب والقرطاسية",
    name_en: "Books & Stationery",
    icon: "BookOpen",
    sort_order: 8,
    is_active: true,
    children: [],
  },
];

/**
 * review_count is fixture-only; real counts come from the reviews Pagination
 * envelope. Price and discount fields now come directly from Product.
 */
export interface DemoProduct extends Omit<
  Product,
  "sale_price" | "rating_avg"
> {
  // The contract marks these optional; every fixture sets them, so narrow to
  // plain numbers and keep the display components free of null-checks.
  sale_price: number;
  rating_avg: number;
  review_count: number;
  compare_at_price: number | null;
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

function demo(
  id: string,
  category_id: string,
  name_ar: string,
  name_en: string,
  sale_price: number,
  rating_avg: number,
  review_count: number,
  compare_at_price: number | null = null,
  photograph?: keyof typeof photographs,
): DemoProduct {
  return {
    id,
    category_id,
    name_ar,
    name_en,
    description: `${name_ar} بجودة عالية للاستخدام اليومي، من تشكيلة شبير المختارة.`,
    sale_price,
    is_negotiable: false,
    floor_price: null,
    points_price: null,
    tracks_expiry: false,
    rating_avg,
    status: "active",
    in_stock: true,
    available_qty: 24,
    images: photograph
      ? [
          `https://images.unsplash.com/${photographs[photograph]}?auto=format&fit=crop&w=640&q=80`,
        ]
      : [],
    variants: [],
    review_count,
    compare_at_price,
    discount_percent:
      compare_at_price !== null && compare_at_price > sale_price
        ? Math.round(((compare_at_price - sale_price) / compare_at_price) * 100)
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
