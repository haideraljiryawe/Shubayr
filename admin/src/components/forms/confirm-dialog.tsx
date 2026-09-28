"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button, Textarea } from "@/components/ui";
import { errorKind, type ErrorKind } from "@/lib/api/errors";
import { FormError } from "./form-error";
import { Field } from "./field";

/**
 * Confirmation for destructive actions.
 *
 * A native <dialog> opened modally, so focus is trapped and Escape cancels
 * without any extra code. Every destructive admin action is audited, and the
 * API requires a reason (3–500 characters) for it; the dialog collects that
 * reason and will not confirm without it. A failure stays inside the dialog
 * with the reason still typed.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = "danger",
  requireReason = true,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel: ReactNode;
  tone?: "danger" | "primary";
  requireReason?: boolean;
  /** Resolve to close; throw (an ApiError) to show the failure in place. */
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
  /** Extra controls, e.g. the new password in a reset. */
  children?: ReactNode;
}) {
  const t = useTranslations("common");
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorKind | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setReason("");
      setError(null);
      setReasonError(null);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function confirm() {
    const trimmed = reason.trim();
    if (requireReason && trimmed.length < 3) {
      setReasonError(t("reasonRequired"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onConfirm(trimmed);
      onClose();
    } catch (cause) {
      setError(errorKind(cause));
      setDetail(cause instanceof Error ? cause.message : null);
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      data-testid="confirm-dialog"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-0 text-text shadow-lg backdrop:bg-text/40"
    >
      <form
        className="flex flex-col gap-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void confirm();
        }}
      >
        <h2 className="text-lg font-bold">{title}</h2>
        {body ? <div className="text-sm text-text-muted">{body}</div> : null}
        {children}
        {requireReason ? (
          <Field
            label={t("reason")}
            error={reasonError}
            hint={t("reasonHint")}
            name="reason"
          >
            <Textarea
              value={reason}
              maxLength={500}
              data-testid="confirm-reason"
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError(null);
              }}
            />
          </Field>
        ) : null}
        <FormError kind={error} detail={detail} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            variant={tone === "danger" ? "danger" : "primary"}
            pending={pending}
            data-testid="confirm-submit"
          >
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
