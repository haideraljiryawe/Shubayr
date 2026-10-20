"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * A yes/no question in the store's own language and look — instead of the
 * browser's confirm(), whose buttons follow the browser's language, not the
 * page's (NOTE-012). A native <dialog>: focus is trapped and Escape cancels.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  testId = "confirm-dialog",
}: {
  open: boolean;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
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
      aria-labelledby={`${testId}-title`}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg bg-surface p-0 text-text shadow-lg backdrop:bg-text/40"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      data-testid={testId}
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id={`${testId}-title`} className="text-lg font-bold">
          {title}
        </h2>
        {body ? <p className="text-sm text-text-muted">{body}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} data-testid={`${testId}-cancel`}>
            {t("back")}
          </Button>
          <Button variant="primary" onClick={onConfirm} data-testid={`${testId}-confirm`}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
