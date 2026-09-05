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
  { id: "c1", parent_id: null, name_ar: "إلكترونيات", name_en: "Electronics", icon: "Smartphone", sort_order: 1, is_active: true, children: [] },
  { id: "c2", parent_id: null, name_ar: "المنزل والمطبخ", name_en: "Home & Kitchen", icon: "Sofa", sort_order: 2, is_active: true, children: [] },
  { id: "c3", parent_id: null, name_ar: "الملابس والأزياء", name_en: "Clothing & Fashion", icon: "Shirt", sort_order: 3, is_active: true, children: [] },
  { id: "c4", parent_id: null, name_ar: "الجمال والعناية", name_en: "Beauty & Care", icon: "Sparkles", sort_order: 4, is_active: true, children: [] },
  { id: "c5", parent_id: null, name_ar: "الرياضة واللياقة", name_en: "Sports & Fitness", icon: "Dumbbell", sort_order: 5, is_active: true, children: [] },
  { id: "c6", parent_id: null, name_ar: "الألعاب والهوايات", name_en: "Games & Hobbies", icon: "Gamepad2", sort_order: 6, is_active: true, children: [] },
  { id: "c7", parent_id: null, name_ar: "الأدوات والمعدات", name_en: "Tools & Equipment", icon: "Drill", sort_order: 7, is_active: true, children: [] },
  { id: "c8", parent_id: null, name_ar: "الكتب والقرطاسية", name_en: "Books & Stationery", icon: "BookOpen", sort_order: 8, is_active: true, children: [] },
];

/**
 * Display-only extras. `review_count` and `compare_at_price` are NOT in the
 * OpenAPI Product schema — they exist so the style guide can render the rating
 * count "(98)" and the "-40%" sale badge from the sheet. If the storefront ends
 * up needing them for real, add them to api/openapi.yaml first.
 */
export interface DemoProduct
  extends Omit<Product, "sale_price" | "rating_avg"> {
  // The contract marks these optional; every fixture sets them, so narrow to
  // plain numbers and keep the display components free of null-checks.
  sale_price: number;
  rating_avg: number;
  review_count: number;
  compare_at_price: number | null;
}

function demo(
  id: string,
  category_id: string,
  name_ar: string,
  name_en: string,
  sale_price: number,
  rating_avg: number,
  review_count: number,
  compare_at_price: number | null = null,
): DemoProduct {
  return {
    id,
    category_id,
    name_ar,
    name_en,
    description:
      "سماعات لاسلكية عالية الجودة مع عزل ضوضاء ووقت تشغيل طويل للبطارية.",
    sale_price,
    is_negotiable: false,
    floor_price: null,
    points_price: null,
    tracks_expiry: false,
    rating_avg,
    status: "active",
    in_stock: true,
    available_qty: 24,
    images: [],
    variants: [],
    review_count,
    compare_at_price,
  };
}

export const demoProducts: DemoProduct[] = [
  demo("p1", "c1", "سماعات لاسلكية", "Wireless headphones", 89, 4.6, 98, 149),
  demo("p2", "c1", "هاتف ذكي", "Smartphone", 299, 4.8, 124),
  demo("p3", "c1", "ساعة ذكية", "Smart watch", 129, 4.7, 76),
  demo("p4", "c1", "لابتوب", "Laptop", 799, 4.8, 210),
];

/** Contract-shaped view of the same fixtures, used by the API client. */
export const mockProducts: Product[] = demoProducts;
