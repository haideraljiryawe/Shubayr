"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * A horizontal strip of page tabs (VIS-015).
 *
 * The strip scrolls sideways inside itself when the tabs do not fit — never
 * the page — and never vertically: the underline of the active tab is drawn
 * inside the tab (no negative margin poking out of the scroller, which is
 * what produced the vertical scrollbar), the strip's baseline is an inset
 * shadow, and the focus ring is inset so nothing is clipped. The current tab
 * is scrolled into view on load.
 */
export function TabStrip({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const current = ref.current?.querySelector<HTMLElement>('[aria-current="page"]');
    current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);
  return (
    <nav aria-label={label} className={cn("mb-4 min-w-0", className)}>
      <div
        ref={ref}
        className="scrollbar-thin flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--t-border)]"
      >
        {children}
      </div>
    </nav>
  );
}

export function TabLink({
  href,
  current,
  children,
  "data-testid": testId,
}: {
  href: string;
  current: boolean;
  children: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      data-testid={testId}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-label",
        "rounded-t-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
        current ? "border-primary-dark text-primary-dark" : "border-transparent text-text-muted hover:text-text",
      )}
    >
      {children}
    </Link>
  );
}
