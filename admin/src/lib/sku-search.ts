/* ---------------------------------------------------------------------------
 * The states of a product search box (VIS-023), kept pure for the tests:
 * a search's answer is tied to the text it was for, so an older answer is
 * never shown as the answer for the text in the box, and "no matching
 * products" is said only for a search that succeeded and found nothing — a
 * search still running, or one that failed, says so instead.
 * ------------------------------------------------------------------------- */

export type SkuSearch<T> =
  | { status: "idle" }
  | { status: "searching"; query: string }
  | { status: "done"; query: string; results: T[] }
  | { status: "failed"; query: string; reason: "forbidden" | "failed" };

export type SearchView = "idle" | "searching" | "results" | "none" | "failed";

export const MIN_QUERY = 2;

/** What the results area shows for the text in the box. `options` counts a result's choosable rows (a product's variants). */
export function searchView<T>(search: SkuSearch<T>, query: string, options: (result: T) => number = () => 1): SearchView {
  const q = query.trim();
  if (q.length < MIN_QUERY) return "idle";
  if (search.status === "idle" || search.status === "searching" || search.query !== q) return "searching";
  if (search.status === "failed") return "failed";
  return search.results.some((result) => options(result) > 0) ? "results" : "none";
}
