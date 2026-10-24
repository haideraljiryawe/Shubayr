"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button, DialogShell } from "@/components/ui";

/**
 * A modal form on the shared dialog shell (VIS-010): fixed title and action
 * footer, a body that scrolls, focus trapped, Escape closes. The caller owns
 * the fields and the submit; the dialog only frames them and stays open on
 * failure, with everything still typed.
 */
export function FormDialog({
  open,
  title,
  description,
  children,
  submitLabel,
  pending = false,
  onSubmit,
  onClose,
  testId,
  footer,
  wide = false,
  size,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  submitLabel: ReactNode;
  pending?: boolean;
  onSubmit: () => void;
  onClose: () => void;
  testId?: string;
  /** Replaces the default cancel/submit row, e.g. for a two-step flow. */
  footer?: ReactNode;
  /** Room for side-by-side previews (the banner editor). */
  wide?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const t = useTranslations("common");
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size={size ?? (wide ? "xl" : "md")}
      busy={pending}
      onSubmit={onSubmit}
      testId={testId}
      footer={
        footer ?? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" pending={pending} data-testid="dialog-submit">
              {submitLabel}
            </Button>
          </>
        )
      }
    >
      {children}
    </DialogShell>
  );
}
