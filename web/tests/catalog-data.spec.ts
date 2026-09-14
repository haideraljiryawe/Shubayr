import { test, expect } from "@playwright/test";
import { api } from "../src/lib/api";
import { listCatalogProducts } from "../src/lib/catalog";
import { parseCatalogQuery, catalogHref } from "../src/lib/catalog-query";

test("normalizes invalid query values and preserves active filters in pagination URLs", () => {
  const query = parseCatalogQuery({
    page: "-2",
    per_page: "999",
    min_price: "٢٠٠",
    max_price: "٥٠",
    min_rating: "4.5",
    sort: "invalid",
    on_sale: "true",
    q: [" headphones ", "ignored"],
  });
  expect(query).toEqual({
    page: 1,
    per_page: 100,
    sort: "newest",
    min_price: 50,
    max_price: 200,
    min_rating: 4.5,
    on_sale: true,
    q: "headphones",
  });
  const url = new URL(
    catalogHref("/search", query, { page: 2 }),
    "http://localhost",
  );
  expect(url.searchParams.get("page")).toBe("2");
  expect(url.searchParams.get("on_sale")).toBe("true");
  expect(
    parseCatalogQuery({ min_rating: "Infinity", page: "NaN", max_price: "-1" }),
  ).toEqual({ page: 1, per_page: 12, sort: "newest" });
});

test("mocks filter the complete catalog before sorting and pagination", async () => {
  const query = {
    category_id: "c1",
    min_price: 50,
    max_price: 200,
    on_sale: true,
    sort: "price_asc" as const,
  };
  const whole = await api.listProducts({ ...query, per_page: 100 });
  expect(whole.total).toBeGreaterThan(1);
  expect(
    whole.data.every(
      (p) =>
        p.category_id === "c1" &&
        p.sale_price! >= 50 &&
        p.sale_price! <= 200 &&
        p.compare_at_price! > p.sale_price!,
    ),
  ).toBe(true);
  expect(whole.data.map((p) => p.sale_price)).toEqual(
    whole.data.map((p) => p.sale_price).sort((a, b) => a! - b!),
  );
  const page = await api.listProducts({ ...query, page: 2, per_page: 1 });
  expect(page.total).toBe(whole.total);
  expect(page.data).toEqual(whole.data.slice(1, 2));
});

test("minimum rating fetches later API pages and computes accurate filtered totals", async () => {
  const original = api.listProducts;
  const calls: unknown[] = [];
  api.listProducts = async (query) => {
    calls.push(query);
    const items = Array.from({ length: 101 }, (_, index) => ({
      id: String(index),
      rating_avg: index === 100 ? 5 : 2,
    }));
    const page = query?.page ?? 1;
    const per_page = query?.per_page ?? 100;
    return {
      page,
      per_page,
      total: items.length,
      data: items.slice((page - 1) * per_page, page * per_page),
    };
  };
  try {
    const result = await listCatalogProducts({
      min_rating: 4,
      page: 1,
      per_page: 12,
    });
    expect(result.total).toBe(1);
    expect(result.data[0].id).toBe("100");
    expect(calls).toEqual([
      { page: 1, per_page: 100 },
      { page: 2, per_page: 100 },
    ]);
  } finally {
    api.listProducts = original;
  }
});

test("rating failures propagate to the listing error state instead of returning partial totals", async () => {
  const original = api.listProducts;
  api.listProducts = async () => {
    throw new Error("API unavailable");
  };
  try {
    await expect(listCatalogProducts({ min_rating: 4 })).rejects.toThrow(
      "API unavailable",
    );
  } finally {
    api.listProducts = original;
  }
});
