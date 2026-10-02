"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { browserApi, unwrap } from "@/lib/api/client";

type Result = { queued: number; synchronized: boolean };

/**
 * POST /admin/products/reindex: mark every product for search sync and run
 * the catch-up now. The API waits for the search engine and answers how many
 * products are still queued; anything left is retried by its periodic
 * catch-up, so "not synchronized" is a status, not a failure.
 */
export function ReindexButton() {
  const t = useTranslations("products.reindex");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" onClick={() => setOpen(true)} data-testid="reindex-open">
        <RefreshCw className="size-4" aria-hidden />
        {t("button")}
      </Button>
      {result ? (
        <p
          role="status"
          className={result.synchronized ? "text-xs font-semibold text-success-dark" : "text-xs font-semibold text-warning-dark"}
          data-testid="reindex-result"
          data-synchronized={result.synchronized}
        >
          {result.synchronized ? t("synchronized") : t("queued", { count: result.queued })}
        </p>
      ) : null}
      <ConfirmDialog
        open={open}
        title={t("title")}
        body={t("body")}
        confirmLabel={t("confirm")}
        tone="primary"
        requireReason={false}
        onConfirm={async () => {
          setResult(await unwrap(browserApi.POST("/admin/products/reindex")));
        }}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
