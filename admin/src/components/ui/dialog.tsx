"use client";

import type { FormEvent, ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { localeDirection, type Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";

/* ---------------------------------------------------------------------------
 * DialogShell — the frame of every dialog in the Web Admin (VIS-010).
 *
 * A fixed header (title, optional context, close button), a body that is the
 * only part that scrolls, and a fixed action footer, all bounded to the
 * viewport. Radix Dialog supplies the modal behaviour: focus moves in and is
 * trapped, Escape closes, focus returns to the opener, the page behind is
 * inert and does not scroll.
 *
 * A form dialog passes `onSubmit`: the shell is then a <form>, so Enter in a
 * field submits and the footer's submit button is a real submit button. A
 * click outside does not close it — typed data is not thrown away by a stray
 * click; Escape and the close button do. While `busy`, nothing closes it.
 * ------------------------------------------------------------------------- */

const SIZES = {
  sm: "w-[min(28rem,calc(100vw-2rem))]",
  md: "w-[min(40rem,calc(100vw-2rem))]",
  lg: "w-[min(52rem,calc(100vw-2rem))]",
  xl: "w-[min(64rem,calc(100vw-2rem))]",
} as const;

export interface DialogShellProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** One short line of context under the title. */
  description?: ReactNode;
  children: ReactNode;
  /** The action row; pinned to the bottom of the dialog. */
  footer?: ReactNode;
  size?: keyof typeof SIZES;
  /** Blocks every way of closing while a request is in flight. */
  busy?: boolean;
  /** Makes the shell a <form>; called with the default prevented. */
  onSubmit?: () => void;
  testId?: string;
  /** Close on a click outside (off for forms). */
  dismissOnOutsideClick?: boolean;
}

export function DialogShell({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  busy = false,
  onSubmit,
  testId,
  dismissOnOutsideClick = !onSubmit,
}: DialogShellProps) {
  const t = useTranslations("common");
  const dir = localeDirection[useLocale() as Locale];

  const inner = (
    <>
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div className="flex min-w-0 flex-col gap-1">
          <DialogPrimitive.Title className="text-section text-text">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-body text-text-muted">
              {description}
            </DialogPrimitive.Description>
          ) : null}
        </div>
        <DialogPrimitive.Close
          type="button"
          disabled={busy}
          aria-label={t("close")}
          data-testid="dialog-close"
          className="-me-2 inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-muted hover:bg-card hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="size-5" aria-hidden />
        </DialogPrimitive.Close>
      </header>
      <div
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5 text-body"
        data-dialog-body
      >
        {children}
      </div>
      {footer ? (
        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-background px-6 py-3">
          {footer}
        </footer>
      ) : null}
    </>
  );

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-text/40" />
        <DialogPrimitive.Content
          dir={dir}
          data-testid={testId}
          {...(description ? {} : { "aria-describedby": undefined })}
          onPointerDownOutside={(event) => {
            if (busy || !dismissOnOutsideClick) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          className={cn(
            // Centred physically: left/translate are direction-independent here.
            "fixed left-1/2 top-1/2 z-50 flex max-h-[min(90dvh,56rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden",
            "rounded-lg border border-border bg-surface text-text shadow-lg focus:outline-none",
            SIZES[size],
          )}
        >
          {onSubmit ? (
            <form
              noValidate
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                event.stopPropagation();
                onSubmit();
              }}
            >
              {inner}
            </form>
          ) : (
            inner
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Radix's primitives, for the rare dialog that needs its own trigger. */
export const Dialog = DialogPrimitive;
