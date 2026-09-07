import { ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";

/** Department → product. Desktop only; mobile uses the back button instead. */
export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label="breadcrumb" className="hidden md:block">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-text-muted">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 ? (
              <ChevronLeft className="size-3.5 rtl-flip" aria-hidden />
            ) : null}
            {item.href ? (
              <Link
                href={item.href}
                className="text-primary-dark hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-text">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
