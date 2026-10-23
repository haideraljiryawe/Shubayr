"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button, DialogShell, Textarea } from "@/components/ui";
import { errorKind, type ErrorKind, errorCode } from "@/lib/api/errors";
import { FormError } from "./form-error";
import { Field } from "./field";
import { useLocaleScopedState } from "@/components/forms/use-locale-scoped-state";

/**
 * The confirmation every destructive or irreversible action goes through,
 * on the shared dialog shell (VIS-010): nothing happens until the person
 * confirms; Cancel, Escape and the close button leave everything as it was.
 *
 * Audited admin actions need a reason (3–500 characters) and the dialog
 * collects it (`requireReason`, the default); a plain confirmation — remove a
 * line, discard a draft — passes `requireReason={false}`. A failure stays
 * inside the dialog with the reason still typed.
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
  onConfirm: (reason: string) => Promise<void> | void;
  onClose: () => void;
  /** Extra controls, e.g. the new password in a reset. */
  children?: ReactNode;
}) {
  const t = useTranslations("common");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorKind | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [reasonError, setReasonError] = useLocaleScopedState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);

  // A fresh start each time it opens.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason("");
      setError(null);
      setReasonError(null);
    }
  }

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
      setCode(errorCode(cause) ?? null);
    } finally {
      setPending(false);
    }
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      busy={pending}
      onSubmit={() => void confirm()}
      testId="confirm-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending} data-testid="confirm-cancel">
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
        </>
      }
    >
      {body ? <div className="text-body text-text-muted">{body}</div> : null}
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
      <FormError kind={error} code={code} />
    </DialogShell>
  );
}
