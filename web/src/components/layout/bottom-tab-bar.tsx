"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useCartCount } from "@/lib/use-cart";
import { useWorkRole } from "@/lib/work-account";
import { isNavItemActive, NAV_ITEMS } from "./nav-items";

/**
 * Mobile bottom tab bar, matching the mockup: five tabs with «السلة» lifted
 * into a green circle in the middle. Hidden from `md` up, where the desktop
 * top nav takes over.
 */
export function BottomTabBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const cartCount = useCartCount();
  // Every tab is a shopping destination a work account cannot use.
  if (useWorkRole()) return null;

  return (
    <nav
      aria-label={t("home")}
      className={cn(
        "md:hidden fixed inset-x-0 bottom-0 z-40",
        "border-t border-border bg-surface",
        "pb-[env(safe-area-inset-bottom)] shadow-lg",
      )}
    >
      <ul className="grid grid-cols-5 items-end px-2 pt-2 pb-1.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isCart = item.key === "cart";
          const isActive = !isCart && isNavItemActive(item, pathname);

          if (isCart) {
            return (
              <li key={item.key} className="flex justify-center">
                <Link
                  href={item.href}
                  className="relative flex flex-col items-center gap-1 -mt-7"
                >
                  <span
                    className={cn(
                      "inline-flex size-14 items-center justify-center rounded-full",
                      "bg-primary text-on-primary shadow-lg",
                      "ring-4 ring-surface transition-colors hover:bg-primary-dark",
                    )}
                  >
                    <Icon className="size-6" aria-hidden />
                  </span>
                  {cartCount > 0 ? (
                    <Badge
                      tone="sale"
                      className="pointer-events-none absolute -top-1 -end-1 min-w-5 rounded-full px-1 py-0 text-[10px] leading-5"
                    >
                      {cartCount}
                    </Badge>
                  ) : null}
                  <span className="sr-only">{t(item.key)}</span>
                </Link>
              </li>
            );
          }

          return (
            <li key={item.key} className="flex justify-center">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 px-2 py-1 rounded-md",
                  "transition-colors",
                  isActive ? "text-primary-dark" : "text-text-muted",
                )}
              >
                <Icon className="size-5.5" aria-hidden />
                <span className="text-[11px] font-medium">{t(item.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
