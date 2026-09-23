"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { isNavItemActive, NAV_ITEMS } from "./nav-items";

/** Desktop top navigation strip, sitting under the header bar. */
export function DesktopNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav className="hidden md:block border-t border-border bg-surface">
      <ul className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 px-4 lg:px-8">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = isNavItemActive(item, pathname);

          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-3 text-sm font-medium",
                  "border-b-2 transition-colors",
                  isActive
                    ? "border-primary text-primary-dark"
                    : "border-transparent text-text hover:text-primary-dark",
                )}
              >
                <Icon className="size-4.5" aria-hidden />
                {t(item.key)}
              </Link>
            </li>
          );
        })}

        <li>
          <Link
            href="/search?on_sale=true"
            className="inline-flex items-center px-4 py-3 text-sm font-medium text-text hover:text-primary-dark transition-colors"
          >
            {t("offers")}
          </Link>
        </li>

        <li className="ms-auto">
          <Link
            href="/style-guide"
            className="inline-flex items-center px-4 py-3 text-sm font-medium text-text-muted hover:text-primary-dark transition-colors"
          >
            {t("styleGuide")}
          </Link>
        </li>
      </ul>
    </nav>
  );
}
