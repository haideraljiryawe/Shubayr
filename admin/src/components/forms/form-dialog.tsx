"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";

/**
 * A modal form: a native <dialog>, so focus is trapped and Escape closes it
 * without extra code (as ConfirmDialog does). The caller owns the fields and
 * the submit; the dialog only frames them and stays open on failure, with
 * everything still typed.
 */
export function FormDialog({
  open,
  title,
  children,
  submitLabel,
  pending = false,
  onSubmit,
  onClose,
  testId,
  footer,
}: {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  submitLabel: ReactNode;
  pending?: boolean;
  onSubmit: () => void;
  onClose: () => void;
  testId?: string;
  /** Replaces the default cancel/submit row, e.g. for a two-step flow. */
  footer?: ReactNode;
}) {
  const t = useTranslations("common");
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      data-testid={testId}
      className="m-auto max-h-[90dvh] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-surface p-0 text-text shadow-lg backdrop:bg-text/40"
    >
      <form
        className="flex flex-col gap-4 p-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <h2 className="text-lg font-bold">{title}</h2>
        {children}
        {footer ?? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" pending={pending} data-testid="dialog-submit">
              {submitLabel}
            </Button>
          </div>
        )}
      </form>
    </dialog>
  );
}
