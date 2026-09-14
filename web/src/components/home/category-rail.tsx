import {
  BookOpen,
  Drill,
  Dumbbell,
  Gamepad2,
  Package,
  Shirt,
  Smartphone,
  Sofa,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { Category } from "@/lib/api";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * `Category.icon` carries a lucide icon name (see the seed fixtures).
 *
 * An explicit map rather than a namespace import: `import * as icons` defeats
 * tree-shaking and pulls the whole icon set into the bundle, and lucide icons
 * are forwardRef objects — not functions — so a `typeof === "function"` guard
 * silently rejects every one of them and renders the fallback for all.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Smartphone,
  Sofa,
  Shirt,
  Sparkles,
  Dumbbell,
  Gamepad2,
  Drill,
  BookOpen,
};

function resolveIcon(name?: string | null): LucideIcon {
  return (name && CATEGORY_ICONS[name]) || Package;
}

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
        const Icon = resolveIcon(category.icon);
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
                <Icon
                  className="size-7 text-primary-dark lg:size-8"
                  strokeWidth={1.5}
                  aria-hidden
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
