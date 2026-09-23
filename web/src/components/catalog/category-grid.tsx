import { CategoryIcon } from "@/components/catalog/category-icon";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { Category } from "@/lib/api";

/** The department directory shares the home rail's cream tiles and sage icons. */
export function CategoryGrid({
  categories,
  locale,
  label,
}: {
  categories: Category[];
  locale: Locale;
  label: string;
}) {
  return (
    <ul
      aria-label={label}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4"
    >
      {categories.map((category) => (
        <li key={category.id ?? category.slug} className="min-w-0">
          <Link
            href={`/category/${encodeURIComponent(category.slug!)}`}
            className="group flex h-full min-h-36 flex-col items-center justify-center gap-4 rounded-md border border-border/60 bg-card px-3 py-6 text-center transition-colors hover:bg-primary-light/20 sm:min-h-44 sm:py-8 lg:min-h-52"
          >
            <CategoryIcon
              iconKey={category.icon_key}
              className="size-14 transition-transform motion-safe:group-hover:scale-105 sm:size-16"
            />
            <span className="text-sm font-semibold text-text [overflow-wrap:anywhere] sm:text-base">
              {locale === "ar"
                ? category.name_ar || category.name_en
                : category.name_en || category.name_ar}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function CategoryGridSkeleton() {
  return (
    <div
      aria-hidden
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="flex min-h-36 flex-col items-center justify-center gap-4 rounded-md border border-border/60 bg-card px-3 py-6 sm:min-h-44 sm:py-8 lg:min-h-52"
        >
          <div className="size-14 rounded-md bg-border motion-safe:animate-pulse sm:size-16" />
          <div className="h-5 w-24 max-w-full rounded-sm bg-border motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}
