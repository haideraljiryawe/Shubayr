import { CategoryIcon } from "@/components/catalog/category-icon";
import type { Category } from "@/lib/api";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * The department quick-nav from the mockup: a tile of icon + label per
 * category. Scroll-snaps horizontally on mobile (mirroring the app) and
 * becomes a full row/grid from `sm` up.
 *
 * URLs use the contract's slug; the category page resolves it to an API id.
 */
export function CategoryRail({
  categories,
  locale,
}: {
  categories: Category[];
  locale: Locale;
}) {
  return (
    <ul
      className={cn(
        "flex gap-3 overflow-x-auto pb-2",
        "snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "sm:grid sm:grid-cols-4 sm:overflow-visible lg:grid-cols-8",
      )}
    >
      {categories.map((category) => {
        const label =
          (locale === "ar" ? category.name_ar : category.name_en) ?? "";

        return (
          <li key={category.id} className="w-24 shrink-0 snap-start sm:w-auto">
            <Link
              href={
                category.slug ? `/category/${category.slug}` : "/categories"
              }
              className="group flex flex-col items-center gap-2 rounded-md p-1 text-center"
            >
              <span
                className={cn(
                  "flex aspect-square w-full items-center justify-center rounded-md",
                  "bg-card transition-colors group-hover:bg-primary-light/40",
                )}
              >
                {/* One icon map for the whole storefront, keyed by the
                    contract's semantic `icon_key`. */}
                <CategoryIcon
                  iconKey={category.icon_key}
                  className="size-7 lg:size-8"
                />
              </span>
              <span className="line-clamp-2 text-xs font-medium text-text lg:text-sm">
                {label}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
