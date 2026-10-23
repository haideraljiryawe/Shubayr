import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The page-level action bar of a long form (VIS-013): Save and its siblings.
 *
 * Place it as the LAST child of the form's own column, never outside it: it is
 * then exactly as wide as the form cards above it, whatever the sidebar does.
 * It sticks to the bottom of the viewport while the form scrolls, is fully
 * bordered and rounded like the cards, and — being in the normal flow — takes
 * its own room at the end, so it can never cover the last field or error.
 * It sits below dialog overlays (z-10 < z-50) and wraps its buttons on narrow
 * screens. Dialogs have their own footer (DialogShell); tables theirs
 * (TableFooter).
 */
export function ActionBar({
  children,
  start,
  className,
  "data-testid": testId,
}: {
  /** The actions, primary last (it ends up at the inline end). */
  children: ReactNode;
  /** Optional context on the inline start: a hint, a status, a count. */
  start?: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-3",
        "rounded-lg border border-border bg-surface px-4 py-3 shadow-md print:hidden",
        className,
      )}
      data-testid={testId}
      data-action-bar
    >
      {start ? <div className="min-w-0 flex-1 text-caption text-text-muted">{start}</div> : null}
      <div className="ms-auto flex flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  );
}
