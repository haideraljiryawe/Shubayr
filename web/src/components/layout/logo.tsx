"use client";

import { useTranslations } from "next-intl";
import { OfficialSymbol } from "@/components/brand/official-symbol";
import { useTheme } from "@/components/providers/theme-provider";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * Mark + wordmark + tagline. Precedence for the mark: the store's own
 * `logo_url` (Store settings) when it is set, otherwise Shubayr's official
 * symbol. The name is the store's configured name either way.
 */
export function Logo({
  showTagline = true,
  className,
}: {
  showTagline?: boolean;
  className?: string;
}) {
  const t = useTranslations("brand");
  const { storeName, logoUrl } = useTheme();

  return (
    <Link
      href="/"
      className={cn("inline-flex items-center gap-2.5 shrink-0", className)}
    >
      <span className="inline-flex size-10 items-center justify-center rounded-md">
        {logoUrl ? (
          // Tenant artwork is an arbitrary remote URL; skip the optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={storeName}
            className="size-7 object-contain"
          />
        ) : (
          <OfficialSymbol size={36} alt="" priority />
        )}
      </span>

      {/* min-w-0 + truncate: on a 320px header the wordmark gives way to the
          controls rather than pushing them off the edge. */}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-lg font-bold text-text">{storeName}</span>
        {showTagline ? (
          <span className="truncate text-[11px] text-text-muted">
            {t("tagline")}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
