import { expect, test } from "@playwright/test";
import type { Brand, Category, Product } from "../../src/lib/api";
import { contentSecurityPolicy } from "../../src/lib/security-headers";
import { isIndexableProduct, jsonLdText, productJsonLd, sitemapEntries } from "../../src/lib/seo";
import { alternatesFor, localizedPath } from "../../src/lib/site";

/**
 * The search-engine and security rules, in Node: which pages are indexable,
 * the sitemap's URL list, the Product structured data, and the CSP. The
 * production server's output is checked in tests/prod/.
 */

const SITE = "https://shop.example.com";

const product = (overrides: Partial<Product>): Product =>
  ({
    id: "p1",
    name_ar: "سماعات",
    name_en: "Headphones",
    description: "Wireless",
    price: 25000,
    effective_price: 25000,
    currency: "IQD",
    status: "active",
    published_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    images: [{ url: "https://cdn.example.com/p1.jpg", is_primary: true }],
    variants: [{ id: "v1", sku: "HP-1", effective_price: 25000 }],
    rating_avg: 4.5,
    rating_count: 12,
    ...overrides,
  }) as Product;

test.describe("indexable pages", () => {
  test("only active, published products are indexable", () => {
    expect(isIndexableProduct({ status: "active", published_at: "2026-01-01T00:00:00Z" })).toBe(true);
    expect(isIndexableProduct({ status: "hidden", published_at: "2026-01-01T00:00:00Z" })).toBe(false);
    expect(isIndexableProduct({ status: "archived", published_at: "2026-01-01T00:00:00Z" })).toBe(false);
    expect(isIndexableProduct({ status: "active", published_at: null })).toBe(false);
  });

  test("paths: Arabic at the bare path, English under /en, with alternates", () => {
    expect(localizedPath("ar", "/")).toBe("/");
    expect(localizedPath("en", "/")).toBe("/en");
    expect(localizedPath("en", "/product/p1")).toBe("/en/product/p1");
    expect(alternatesFor("en", "/brands")).toEqual({
      canonical: "/en/brands",
      languages: { ar: "/brands", en: "/en/brands", "x-default": "/brands" },
    });
  });
});

test("the sitemap lists visible categories, brands and active products only", () => {
  const categories = [
    { id: "c1", slug: "electronics", is_visible: true, children: [{ id: "c2", slug: "phones", is_visible: true }, { id: "c3", slug: "secret", is_visible: false }] },
    { id: "c4", slug: "hidden-dept", is_visible: false, children: [] },
  ] as unknown as Category[];
  const brands = [
    { id: "b1", slug: "sonic", is_visible: true, updated_at: "2026-09-01T00:00:00Z" },
    { id: "b2", slug: "retired", is_visible: false },
  ] as unknown as Brand[];
  const products = [
    product({ id: "p1" }),
    product({ id: "p2", status: "hidden" }),
    product({ id: "p3", status: "archived" }),
    product({ id: "p4", published_at: null }),
  ];
  const urls = sitemapEntries({ siteUrl: SITE, categories, brands, products }).map((entry) => entry.url);
  expect(urls).toEqual([
    `${SITE}/`,
    `${SITE}/categories`,
    `${SITE}/brands`,
    `${SITE}/category/electronics`,
    `${SITE}/category/phones`,
    `${SITE}/search?brand_id=b1`,
    `${SITE}/product/p1`,
  ]);
  const entry = sitemapEntries({ siteUrl: SITE, categories: [], brands: [], products: [product({})] }).at(-1)!;
  expect(entry.alternates.languages).toEqual({ ar: `${SITE}/product/p1`, en: `${SITE}/en/product/p1` });
  expect(entry.lastModified).toBe("2026-10-01T00:00:00Z");
});

/** The fields Google requires for a Product rich result, checked strictly. */
function expectValidProduct(data: ReturnType<typeof productJsonLd>) {
  expect(data["@context"]).toBe("https://schema.org");
  expect(data["@type"]).toBe("Product");
  expect(typeof data.name).toBe("string");
  expect(data.name.length).toBeGreaterThan(0);
  expect(data.url).toMatch(/^https:\/\//);
  for (const image of data.image ?? []) expect(image).toMatch(/^https?:\/\//);
  const offers = data.offers as Record<string, unknown>;
  expect(offers.priceCurrency).toBe("IQD");
  expect(String(offers.availability)).toMatch(/^https:\/\/schema\.org\/(InStock|OutOfStock|LimitedAvailability)$/);
  if (offers["@type"] === "Offer") {
    expect(typeof offers.price).toBe("number");
    expect(offers.price as number).toBeGreaterThan(0);
  } else {
    expect(offers["@type"]).toBe("AggregateOffer");
    expect(offers.lowPrice as number).toBeLessThan(offers.highPrice as number);
  }
}

test.describe("product structured data", () => {
  test("a Product with an IQD Offer and its availability", () => {
    const data = productJsonLd({ product: product({}), locale: "ar", siteUrl: SITE, level: "in_stock", storeName: "شبير" });
    expectValidProduct(data);
    expect(data).toMatchObject({
      name: "سماعات",
      url: `${SITE}/product/p1`,
      sku: "HP-1",
      offers: { "@type": "Offer", price: 25000, priceCurrency: "IQD", availability: "https://schema.org/InStock" },
      aggregateRating: { ratingValue: 4.5, reviewCount: 12 },
    });
  });

  test("SKUs at different prices give an AggregateOffer; out of stock says so", () => {
    const data = productJsonLd({
      product: product({ variants: [{ id: "v1", sku: "A", effective_price: 20000 }, { id: "v2", sku: "B", effective_price: 30000 }] as Product["variants"] }),
      locale: "en",
      siteUrl: SITE,
      level: "out_of_stock",
      storeName: "Shubayr",
    });
    expectValidProduct(data);
    expect(data.url).toBe(`${SITE}/en/product/p1`);
    expect(data.offers).toMatchObject({ "@type": "AggregateOffer", lowPrice: 20000, highPrice: 30000, offerCount: 2, availability: "https://schema.org/OutOfStock" });
  });

  test("the JSON can't break out of its script tag", () => {
    expect(jsonLdText({ name: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });
});

test("the CSP never allows inline scripts, and frames only from itself", () => {
  const csp = contentSecurityPolicy({ nonce: "abc", dev: false, apiOrigin: "https://api.example.com", https: true });
  const scriptSrc = csp.split("; ").find((directive) => directive.startsWith("script-src "))!;
  expect(scriptSrc).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'");
  expect(csp).toContain("connect-src 'self' https://api.example.com");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("upgrade-insecure-requests");
  expect(contentSecurityPolicy({ nonce: "x", dev: true, apiOrigin: null, https: false })).toContain("'unsafe-eval'");
});
