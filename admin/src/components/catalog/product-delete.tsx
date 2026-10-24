"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Archive, CheckCircle2, Trash2, XCircle } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { browserApi, unwrap } from "@/lib/api/client";
import { describeError } from "@/lib/api/errors";
import { deleteEach, type DeleteSummary } from "@/lib/product-delete";

/**
 * The confirmation for deleting one or more products. The server decides
 * per product, so the dialog explains both outcomes and why: deleted
 * completely when it was never used, archived when it has history (orders,
 * stock, purchases, reviews, price approvals or a banner pointing at it).
 */
export function ProductDeleteDialog({
  open,
  products,
  onClose,
  onDone,
}: {
  open: boolean;
  products: ReadonlyArray<{ id: string; name: string }>;
  onClose: () => void;
  onDone: (summary: DeleteSummary) => void;
}) {
  const t = useTranslations("products.delete");
  const tErrors = useTranslations("errors");
  const single = products.length === 1;
  return (
    <ConfirmDialog
      open={open}
      requireReason={false}
      title={single ? t("titleOne", { name: products[0]?.name ?? "" }) : t("titleMany", { count: products.length })}
      body={
        <div className="flex flex-col gap-2 text-body" data-testid="product-delete-explain">
          <p className="flex items-start gap-2">
            <Trash2 className="mt-0.5 size-4 shrink-0 text-error-dark" aria-hidden />
            <span>{single ? t("ruleDeleteOne") : t("ruleDeleteMany")}</span>
          </p>
          <p className="flex items-start gap-2">
            <Archive className="mt-0.5 size-4 shrink-0 text-warning-dark" aria-hidden />
            <span>{single ? t("ruleArchiveOne") : t("ruleArchiveMany")}</span>
          </p>
          <p className="text-caption text-text-muted">{t("noUndo")}</p>
        </div>
      }
      confirmLabel={single ? t("confirmOne") : t("confirmMany", { count: products.length })}
      onConfirm={async () => {
        const summary = await deleteEach(
          products,
          (id) => unwrap(browserApi.POST("/admin/products/{id}/delete", { params: { path: { id } } })),
          (cause) => describeError(tErrors, cause),
        );
        onDone(summary);
      }}
      onClose={onClose}
    />
  );
}

/** What happened, in words: how many deleted, archived (and why), failed. */
export function ProductDeleteOutcome({ summary, linkArchived = true }: { summary: DeleteSummary; linkArchived?: boolean }) {
  const t = useTranslations("products.delete");
  const list = new Intl.ListFormat(useLocale(), { type: "conjunction" });
  const tone = summary.failed ? "danger" : summary.archived ? "info" : "success";
  return (
    <Alert
      tone={tone}
      data-testid="product-delete-outcome"
      data-deleted={summary.deleted}
      data-archived={summary.archived}
      data-failed={summary.failed}
    >
      {summary.deleted ? <p className="font-semibold">{t("deleted", { count: summary.deleted })}</p> : null}
      {summary.archived ? (
        <div className="mt-1">
          <p className="font-semibold">{t("archived", { count: summary.archived })}</p>
          <p className="text-body">{t("archivedWhy")}</p>
          <ul className="mt-1 list-disc ps-5 text-body" data-testid="product-delete-reasons">
            {summary.reasons.map((reason) => (
              <li key={reason} data-reason={reason}>
                {t(`reasons.${reason}`)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {summary.failed ? <p className="mt-1 font-semibold">{t("failed", { count: summary.failed })}</p> : null}
      {summary.lines.length > 1 || summary.failed ? (
        <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto pe-2 text-body" data-testid="product-delete-lines">
          {summary.lines.map((line) => (
            <li key={line.id} className="flex items-start gap-2" data-testid="product-delete-line" data-outcome={line.outcome}>
              {line.outcome === "deleted" ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label={t("outcome.deleted")} />
              ) : line.outcome === "archived" ? (
                <Archive className="mt-0.5 size-4 shrink-0 text-warning-dark" aria-label={t("outcome.archived")} />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-error" aria-label={t("outcome.failed")} />
              )}
              <span>
                {line.outcome === "archived" && linkArchived ? (
                  <Link href={`/catalog/products/${line.id}`} className="font-semibold hover:underline">
                    {line.name}
                  </Link>
                ) : (
                  <span className="font-semibold">{line.name}</span>
                )}
                {" — "}
                {line.outcome === "failed"
                  ? line.message
                  : line.outcome === "archived"
                    ? `${t("outcome.archived")}: ${list.format(line.reasons.map((reason) => t(`reasons.${reason}`)))}`
                    : t("outcome.deleted")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Alert>
  );
}

/**
 * "Delete product" on the product page. Deleted: back to the list. Archived:
 * the page stays, now showing the archived status, with why it was kept.
 */
export function ProductDeleteAction({ id, name }: { id: string; name: string }) {
  const t = useTranslations("products.delete");
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<DeleteSummary | null>(null);
  return (
    <>
      <Button variant="secondary" className="text-error-dark" onClick={() => setOpen(true)} data-testid="product-delete">
        <Trash2 className="size-4" aria-hidden />
        {t("action")}
      </Button>
      <ProductDeleteDialog
        open={open}
        products={[{ id, name }]}
        onClose={() => setOpen(false)}
        onDone={(result) => {
          if (result.deleted) {
            toast(t("deletedToast", { name }));
            router.push("/catalog/products");
            return;
          }
          setSummary(result);
          router.refresh();
        }}
      />
      {summary ? (
        <div className="basis-full" data-testid="product-delete-result">
          <ProductDeleteOutcome summary={summary} linkArchived={false} />
        </div>
      ) : null}
    </>
  );
}
