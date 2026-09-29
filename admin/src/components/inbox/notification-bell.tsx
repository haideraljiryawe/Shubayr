"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { inbox, useInbox } from "@/lib/inbox";
import { InboxList } from "./inbox-list";

/**
 * The header bell: live unread count, and a dropdown with the latest
 * notifications. Mounting it starts the tab's stream; unmounting (signing
 * out) stops it.
 */
export function NotificationBell() {
  const t = useTranslations("inbox");
  const { unread, stream } = useInbox();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const count = unread ?? 0;

  useEffect(() => {
    inbox.start();
    return () => inbox.stop();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = count > 0 ? t("bellUnread", { count }) : t("bell");

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        data-testid="header-bell"
        data-stream={stream}
        className="relative inline-flex size-10 items-center justify-center rounded-md hover:bg-card"
      >
        <Bell className="size-5" aria-hidden />
        {count > 0 ? (
          <span
            className="absolute -top-0.5 -end-0.5 min-w-5 rounded-full bg-error px-1 text-center text-[10px] font-bold leading-5 text-white"
            data-testid="bell-badge"
          >
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={t("title")}
          className="absolute end-0 top-12 z-40 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-4 shadow-lg"
        >
          <InboxList compact onNavigate={() => setOpen(false)} />
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="mt-2 block text-center text-sm font-semibold text-primary-dark hover:underline"
            data-testid="inbox-view-all"
          >
            {t("viewAll")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
