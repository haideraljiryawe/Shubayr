import type {
  HTMLAttributes,
  ReactNode,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

/* ---------------------------------------------------------------------------
 * The table family (VIS-011 / VIS-012 / VIS-014). Every table in the Web
 * Admin — list pages, detail pages, forms and dialogs — is built from these,
 * so direction, alignment, padding and type are decided once:
 *
 * - Headings and cells share one padding and one logical alignment: the
 *   inline start (right in Arabic, left in English), so a heading always
 *   sits over its values. `align="end"` is for a trailing actions column;
 *   `align="center"` for a lone checkbox or icon.
 * - Text roles come from the type scale (text-table-head, text-body); a
 *   table never shrinks its text to fit — it scrolls sideways in its frame.
 * - TableCard frames a table: an optional title/toolbar band inside the card
 *   (light background, full-width divider), the table, and an optional
 *   footer band (TableFooter) — all inside the same rounded border.
 * ------------------------------------------------------------------------- */

type Align = "start" | "end" | "center";

const ALIGN: Record<Align, string> = {
  start: "text-start",
  end: "text-end",
  center: "text-center",
};

/** A rounded card holding one table, with its toolbar and footer inside it. */
export function TableCard({
  title,
  toolbar,
  footer,
  children,
  className,
  pending = false,
  "data-testid": testId,
}: {
  /** Title, status and context links of the thing the table belongs to. */
  title?: ReactNode;
  /** Card-level tools: search, filters, parent actions. */
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  pending?: boolean;
  "data-testid"?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm",
        className,
      )}
      data-testid={testId}
    >
      {title || toolbar ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3"
          data-table-toolbar
        >
          {title ? <div className="flex min-w-0 flex-col gap-0.5">{title}</div> : null}
          {toolbar ? (
            <div className={cn("flex flex-wrap items-end gap-3", title ? "" : "w-full")}>{toolbar}</div>
          ) : null}
        </div>
      ) : null}
      <div
        className={cn("transition-opacity", pending && "opacity-60")}
        aria-busy={pending || undefined}
      >
        {children}
      </div>
      {footer}
    </section>
  );
}

/**
 * The <table> and its horizontal scroller. `framed` (default false) draws the
 * card border itself, for a table that stands alone without a TableCard.
 */
export function Table({
  children,
  caption,
  minWidth,
  framed = false,
  className,
  ...props
}: HTMLAttributes<HTMLTableElement> & {
  caption?: ReactNode;
  /** The width below which the table scrolls instead of squeezing, e.g. "40rem". */
  minWidth?: string;
  framed?: boolean;
}) {
  return (
    <div
      className={cn(
        // `relative` keeps the sr-only caption inside this scroller; without
        // it, in RTL, it is placed against the page and widens the document.
        "relative min-w-0 overflow-x-auto",
        framed && "rounded-lg border border-border bg-surface shadow-sm",
      )}
    >
      <table
        className={cn("w-full border-collapse text-body text-text", className)}
        style={minWidth ? { minWidth } : undefined}
        {...props}
      >
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-card text-table-head text-text-muted", className)} {...props} />;
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TFoot({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tfoot className={cn("border-t-2 border-border font-semibold", className)} {...props} />;
}

export function Tr({
  className,
  interactive = true,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        "border-t border-border first:border-t-0 [thead_&]:border-t-0",
        interactive && "[tbody_&]:hover:bg-background",
        className,
      )}
      {...props}
    />
  );
}

export function Th({
  align = "start",
  className,
  scope = "col",
  ...props
}: Omit<ThHTMLAttributes<HTMLTableCellElement>, "align"> & { align?: Align }) {
  return (
    <th
      scope={scope}
      className={cn("px-4 py-3 align-middle font-semibold", ALIGN[align], className)}
      {...props}
    />
  );
}

export function Td({
  align = "start",
  className,
  ...props
}: Omit<TdHTMLAttributes<HTMLTableCellElement>, "align"> & { align?: Align }) {
  return <td className={cn("px-4 py-3 align-middle", ALIGN[align], className)} {...props} />;
}

/** The single row shown when a table has no rows. */
export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-text-muted">
        {children}
      </td>
    </tr>
  );
}
