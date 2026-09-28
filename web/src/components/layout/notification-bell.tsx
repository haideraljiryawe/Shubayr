"use client";

import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNotificationCenter } from "@/lib/use-notifications";

/**
 * The header bell: the unread count from the notification center, kept live
 * by its stream, and the way into the inbox. Shown to every signed-in role.
 */
export function NotificationBell() {
  const t = useTranslations("inbox");
  const { unread } = useNotificationCenter();
  const count = unread ?? 0;
  const label = count > 0 ? t("bellUnread", { count }) : t("bell");

  return (
    <span className="relative inline-flex">
      <Link
        href="/notifications"
        aria-label={label}
        title={label}
        data-testid="header-bell"
        className="inline-flex size-10 items-center justify-center rounded-full text-text transition-colors duration-150 hover:bg-card"
      >
        <Bell className="size-5" aria-hidden />
      </Link>
      {count > 0 ? (
        <Badge
          tone="sale"
          className={cn(
            "pointer-events-none absolute -top-0.5 -end-0.5",
            "min-w-5 rounded-full px-1 py-0 text-[10px] leading-5",
          )}
        >
          <span data-testid="bell-badge">{count > 99 ? "99+" : count}</span>
        </Badge>
      ) : null}
    </span>
  );
}
