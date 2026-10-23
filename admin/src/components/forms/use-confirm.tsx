"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "./confirm-dialog";

interface Request {
  title?: ReactNode;
  body?: ReactNode;
  confirmLabel?: ReactNode;
  onConfirm: () => void | Promise<void>;
}

/**
 * A confirmation step in front of an action that used to happen on one click
 * — removing a line from a draft, clearing rows. `confirm({...})` opens the
 * shared ConfirmDialog; only its confirm button runs `onConfirm`; Cancel,
 * Escape and the close button change nothing. Render `dialog` once.
 * Defaults to the "remove this line" wording.
 */
export function useConfirm(): { confirm: (request: Request) => void; dialog: ReactNode } {
  const t = useTranslations("confirmRemove");
  const [request, setRequest] = useState<Request | null>(null);
  const dialog = (
    <ConfirmDialog
      open={request !== null}
      title={request?.title ?? t("title")}
      body={request?.body ?? t("body")}
      confirmLabel={request?.confirmLabel ?? t("action")}
      requireReason={false}
      onConfirm={async () => {
        await request?.onConfirm();
      }}
      onClose={() => setRequest(null)}
    />
  );
  return { confirm: setRequest, dialog };
}
