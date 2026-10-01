import type { Category } from "./api";

/**
 * The catalog is exactly two levels: departments and their subcategories.
 * The API refuses a third level on every write, but the storefront does not
 * lean on that alone — anything deeper than a subcategory is dropped here, so
 * no page can ever render or link a grandchild.
 */
export function twoLevelTree(categories: Category[]): Category[] {
  return categories.map((department) => ({
    ...department,
    children: (department.children ?? []).map((subcategory) => ({
      ...subcategory,
      children: [],
    })),
  }));
}
