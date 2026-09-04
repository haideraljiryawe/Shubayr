import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * «الأقسام الرئيسية … عرض الكل» — section title with a trailing "view all"
 * link. The chevron points toward the inline end, so it flips under LTR.
 */
export function SectionHeader({
  title,
  actionLabel,
  href,
  className,
  children,
}: {
  title: string;
  actionLabel?: string;
  href?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <h2 className="text-lg font-bold text-text">{title}</h2>

      {children}

      {actionLabel && href ? (
        <Link
          href={href}
          className="inline-flex items-center gap-0.5 text-sm font-medium text-primary hover:text-primary-dark transition-colors"
        >
          {actionLabel}
          <ChevronLeft className="size-4 rtl-flip" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
