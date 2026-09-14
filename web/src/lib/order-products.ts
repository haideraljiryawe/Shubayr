"use client";

import { useEffect, useState } from "react";
import { api, type Product } from "./api";

/* ---------------------------------------------------------------------------
 * Product details for order lines.
 *
 * CONTRACT NOTE: OrderItem carries product_id, quantity and money — no name and
 * no image — so anything that shows an order the way a customer expects has to
 * resolve the catalogue itself. Embedding a small product summary in OrderItem
 * would remove these round-trips; worth raising with the API team.
 *
 * Until then: fetch each distinct product once and keep it in a module cache,
 * so moving between the orders list and an order detail does not refetch what
 * has already been read.
 * ------------------------------------------------------------------------- */

const cache = new Map<string, Product | null>();

/** Resolve products for the given ids; renders again as they arrive. */
export function useOrderProducts(ids: string[]): Map<string, Product> {
  // The ids come from a fresh array each render, so compare by value.
  const key = [...new Set(ids.filter(Boolean))].sort().join(",");
  const [, setVersion] = useState(0);

  useEffect(() => {
    const wanted = key ? key.split(",") : [];
    const missing = wanted.filter((id) => !cache.has(id));
    if (missing.length === 0) return;

    let active = true;
    Promise.all(
      missing.map((id) =>
        api
          .getProduct(id)
          // A product that has since been deleted is cached as a miss rather
          // than retried on every render.
          .then((product) => cache.set(id, product))
          .catch(() => cache.set(id, null)),
      ),
    ).then(() => {
      if (active) setVersion((version) => version + 1);
    });

    return () => {
      active = false;
    };
  }, [key]);

  const resolved = new Map<string, Product>();
  for (const id of key ? key.split(",") : []) {
    const product = cache.get(id);
    if (product) resolved.set(id, product);
  }
  return resolved;
}
