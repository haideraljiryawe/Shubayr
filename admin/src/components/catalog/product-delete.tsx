"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Archive, CheckCircle2, ChevronDown, Trash2, XCircle } from "lucide-react";
import { Alert, Button, DialogShell, Spinner } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { browserApi, unwrap } from "@/lib/api/client";
import { describeError, errorKind } from "@/lib/api/errors";
import {
  BulkDeleteError,
  applyBulk,
  bulkLines,
  chunk,
  deleteSummary,
  planBulk,
  previewSummary,
  reasonKey,
  renewBatch,
  type BulkBatch,
  type DeletePreview,
  type DeleteSummary,
  type PreviewLine,
  type PreviewSummary,
} from "@/lib/product-delete";

/** A reason in words; one the admin doesn't know yet reads as a generic one. */
function useReasonText() {
  const t = useTranslations("products.delete");
  return (reason: string) => t(`reasons.${reasonKey(reason)}`);
}

function ReasonList({ reasons, testId = "product-delete-reasons" }: { reasons: readonly string[]; testId?: string }) {
  const text = useReasonText();
  return (
    <ul className="list-disc ps-5 text-body text-text" data-testid={testId}>
      {reasons.map((reason) => (
        <li key={reason} data-reason={reason}>
          {text(reason)}
        </li>
      ))}
    </ul>
  );
}

function Checking({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-body text-text-muted" role="status" data-testid="product-delete-checking">
      <Spinner />
      {label}
    </p>
  );
}

/** The rule, for when the server couldn't be asked in advance. */
function GenericRule({ single }: { single: boolean }) {
  const t = useTranslations("products.delete");
  return (
    <div className="flex flex-col gap-2 text-body" data-testid="product-delete-explain">
      <p className="text-text-muted">{t("previewFailed")}</p>
      <p className="flex items-start gap-2">
        <Trash2 className="mt-0.5 size-4 shrink-0 text-error-dark" aria-hidden />
        <span>{single ? t("ruleDeleteOne") : t("ruleDeleteMany")}</span>
      </p>
      <p className="flex items-start gap-2">
        <Archive className="mt-0.5 size-4 shrink-0 text-warning-dark" aria-hidden />
        <span>{single ? t("ruleArchiveOne") : t("ruleArchiveMany")}</span>
      </p>
    </div>
  );
}

type Preview<T> = { status: "loading" } | { status: "ready"; value: T } | { status: "error" };

/* ------------------------------------------------------------------ one */

/**
 * Deleting one product, from its page. The dialog asks the server first and
 * says what will happen: deleted for good (never used), archived (it has
 * history, listed), or neither (only Close). If that check fails, the rule
 * is explained and the action still works: the server decides either way.
 */
function SingleDeleteDialog({
  id,
  name,
  onClose,
  onDone,
}: {
  id: string;
  name: string;
  onClose: () => void;
  onDone: (summary: DeleteSummary) => void;
}) {
  const t = useTranslations("products.delete");
  const tc = useTranslations("common");
  const tErrors = useTranslations("errors");
  const [preview, setPreview] = useState<Preview<DeletePreview>>({ status: "loading" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    unwrap(browserApi.GET("/admin/products/{id}/delete-preview", { params: { path: { id } } }))
      .then((value) => live && setPreview({ status: "ready", value }))
      .catch(() => live && setPreview({ status: "error" }));
    return () => {
      live = false;
    };
  }, [id]);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const result = await unwrap(browserApi.POST("/admin/products/{id}/delete", { params: { path: { id } } }));
      onDone(deleteSummary([{ id, name, outcome: result.outcome, reasons: [...result.reasons] }]));
    } catch (cause) {
      setError(describeError(tErrors, cause));
      setPending(false);
    }
  }

  const outcome = preview.status === "ready" ? preview.value.outcome : preview.status;
  let body: ReactNode;
  if (preview.status === "loading") body = <Checking label={t("checking")} />;
  else if (preview.status === "error") body = <GenericRule single />;
  else if (preview.value.outcome === "delete")
    body = (
      <p className="flex items-start gap-2 text-body" data-testid="product-delete-explain">
        <Trash2 className="mt-0.5 size-4 shrink-0 text-error-dark" aria-hidden />
        <span>{t("willDelete")}</span>
      </p>
    );
  else
    body = (
      <div className="flex flex-col gap-2 text-body" data-testid="product-delete-explain">
        <p className="flex items-start gap-2">
          {preview.value.outcome === "archive" ? (
            <Archive className="mt-0.5 size-4 shrink-0 text-warning-dark" aria-hidden />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0 text-error" aria-hidden />
          )}
          <span>{preview.value.outcome === "archive" ? t("willArchive") : t("cannot")}</span>
        </p>
        {preview.value.reasons.length ? (
          <div className="flex flex-col gap-1">
            {preview.value.outcome === "archive" ? <p className="text-label">{t("why")}</p> : null}
            <ReasonList reasons={preview.value.reasons} />
          </div>
        ) : null}
      </div>
    );

  const footer =
    outcome === "failed" ? (
      <Button variant="secondary" onClick={onClose} data-testid="confirm-close">
        {tc("close")}
      </Button>
    ) : (
      <>
        <Button variant="ghost" onClick={onClose} disabled={pending} data-testid="confirm-cancel">
          {tc("cancel")}
        </Button>
        <Button
          type="submit"
          variant={outcome === "archive" ? "primary" : "danger"}
          disabled={outcome === "loading"}
          pending={pending}
          data-testid="confirm-submit"
        >
          {outcome === "archive" ? <Archive className="size-4" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
          {outcome === "archive" ? t("confirmArchive") : t("confirmOne")}
        </Button>
      </>
    );

  return (
    <DialogShell
      open
      onClose={onClose}
      title={t("titleOne", { name })}
      size="sm"
      busy={pending}
      onSubmit={() => {
        if (outcome !== "loading" && outcome !== "failed" && !pending) void confirm();
      }}
      testId="confirm-dialog"
      footer={footer}
    >
      <div data-testid="product-delete-preview" data-outcome={outcome}>
        {body}
      </div>
      <p className="text-caption text-text-muted">{t("noUndo")}</p>
      {error ? (
        <Alert tone="danger" data-testid="product-delete-error">
          {error}
        </Alert>
      ) : null}
    </DialogShell>
  );
}

/* ----------------------------------------------------------------- bulk */

function PreviewGroup({ label, lines, group, icon }: { label: string; lines: readonly PreviewLine[]; group: string; icon: ReactNode }) {
  const text = useReasonText();
  const list = new Intl.ListFormat(useLocale(), { type: "conjunction" });
  if (!lines.length) return null;
  return (
    <details className="group rounded-md border border-border" data-testid={`bulk-preview-${group}`} data-count={lines.length}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-label text-text [&::-webkit-details-marker]:hidden">
        {icon}
        <span className="min-w-0 flex-1">{label}</span>
        <ChevronDown className="size-4 shrink-0 text-text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="max-h-56 space-y-1 overflow-y-auto border-t border-border px-3 py-2 text-body">
        {lines.map((line) => (
          <li key={line.id} data-testid="bulk-preview-line" data-outcome={line.outcome}>
            <span className="font-semibold">{line.name}</span>
            {line.reasons.length ? <span className="text-text-muted"> — {list.format(line.reasons.map(text))}</span> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Bulk delete from the product list. The dialog first previews every
 * selected product and says how many will be deleted, archived, or can't be
 * processed, each group openable to see which and why. Confirming sends ONE
 * idempotent bulk-delete per 500 products, with operation ids made when the
 * dialog opened; a retry after a lost connection resends the same ids (the
 * server doesn't apply them twice), a 409 gets a new id.
 */
function BulkDeleteDialog({
  products: selected,
  onClose,
  onDone,
}: {
  products: ReadonlyArray<{ id: string; name: string }>;
  onClose: () => void;
  onDone: (summary: DeleteSummary) => void;
}) {
  const t = useTranslations("products.delete");
  const tc = useTranslations("common");
  const tErrors = useTranslations("errors");
  // The selection as it was when the dialog opened.
  const [products] = useState(selected);
  const ids = useMemo(() => products.map((product) => product.id), [products]);
  const names = useMemo(() => new Map(products.map((product) => [product.id, product.name])), [products]);
  const [preview, setPreview] = useState<Preview<PreviewSummary>>({ status: "loading" });
  // Made once, when the dialog opens.
  const [batches, setBatches] = useState<BulkBatch[]>(() => planBulk(ids));
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all(chunk(ids).map((part) => unwrap(browserApi.POST("/admin/products/delete-preview", { body: { ids: part } }))))
      .then((answers) => live && setPreview({ status: "ready", value: previewSummary(products, answers.flatMap((answer) => answer.results)) }))
      .catch(() => live && setPreview({ status: "error" }));
    return () => {
      live = false;
    };
  }, [ids, products]);

  async function confirm() {
    setPending(true);
    setProblem(null);
    try {
      const done = await applyBulk(batches, (batch) => unwrap(browserApi.POST("/admin/products/bulk-delete", { body: batch })));
      onDone(deleteSummary(bulkLines(done, names)));
    } catch (cause) {
      if (!(cause instanceof BulkDeleteError)) {
        setProblem(describeError(tErrors, cause));
      } else if (errorKind(cause.failure) === "conflict") {
        setBatches(renewBatch(cause.batches, cause.index));
        setProblem(t("conflict"));
      } else {
        // Same ids on the retry: whatever the server already applied comes back as it was.
        setBatches(cause.batches);
        setProblem(t("retry", { error: describeError(tErrors, cause.failure) }));
      }
      setPending(false);
    }
  }

  const summary = preview.status === "ready" ? preview.value : null;
  const deleting = summary?.delete.length ?? 0;
  const archiving = summary?.archive.length ?? 0;
  const nothing = summary !== null && deleting + archiving === 0;
  const label = !summary
    ? t("confirmMany", { count: products.length })
    : deleting && archiving
      ? t("confirmBoth", { deleted: deleting, archived: archiving })
      : archiving
        ? t("confirmArchiveMany", { count: archiving })
        : t("confirmMany", { count: deleting });

  return (
    <DialogShell
      open
      onClose={onClose}
      title={t("titleMany", { count: products.length })}
      size="md"
      busy={pending}
      onSubmit={() => {
        if (preview.status !== "loading" && !nothing && !pending) void confirm();
      }}
      testId="confirm-dialog"
      footer={
        nothing ? (
          <Button variant="secondary" onClick={onClose} data-testid="confirm-close">
            {tc("close")}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={pending} data-testid="confirm-cancel">
              {tc("cancel")}
            </Button>
            <Button
              type="submit"
              variant={deleting || !summary ? "danger" : "primary"}
              disabled={preview.status === "loading"}
              pending={pending}
              data-testid="confirm-submit"
            >
              {label}
            </Button>
          </>
        )
      }
    >
      <div data-testid="bulk-preview" data-state={preview.status} data-delete={deleting} data-archive={archiving} data-failed={summary?.failed.length ?? 0}>
        {preview.status === "loading" ? (
          <Checking label={t("checkingMany")} />
        ) : preview.status === "error" ? (
          <GenericRule single={false} />
        ) : (
          <div className="flex flex-col gap-2">
            <PreviewGroup
              group="delete"
              lines={preview.value.delete}
              label={t("willDeleteCount", { count: deleting })}
              icon={<Trash2 className="size-4 shrink-0 text-error-dark" aria-hidden />}
            />
            <PreviewGroup
              group="archive"
              lines={preview.value.archive}
              label={t("willArchiveCount", { count: archiving })}
              icon={<Archive className="size-4 shrink-0 text-warning-dark" aria-hidden />}
            />
            <PreviewGroup
              group="failed"
              lines={preview.value.failed}
              label={t("cannotCount", { count: preview.value.failed.length })}
              icon={<XCircle className="size-4 shrink-0 text-error" aria-hidden />}
            />
            {nothing ? <p className="text-body">{t("nothingToDo")}</p> : null}
          </div>
        )}
      </div>
      {batches.length > 1 ? <p className="text-caption text-text-muted" data-testid="bulk-batches">{t("batches", { count: products.length })}</p> : null}
      <p className="text-caption text-text-muted">{t("noUndo")}</p>
      {problem ? (
        <Alert tone="danger" data-testid="bulk-delete-problem">
          {problem}
        </Alert>
      ) : null}
    </DialogShell>
  );
}

/** The bulk confirmation; mounted only while open, so each opening previews afresh with new operation ids. */
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
  if (!open || !products.length) return null;
  return (
    <BulkDeleteDialog
      products={products}
      onClose={onClose}
      onDone={(summary) => {
        onClose();
        onDone(summary);
      }}
    />
  );
}

/* -------------------------------------------------------------- outcome */

/** What happened, in words: how many deleted, archived (and why), failed. */
export function ProductDeleteOutcome({ summary, linkArchived = true }: { summary: DeleteSummary; linkArchived?: boolean }) {
  const t = useTranslations("products.delete");
  const text = useReasonText();
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
          <div className="mt-1">
            <ReasonList reasons={summary.reasons} />
          </div>
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
                {line.outcome === "deleted"
                  ? t("outcome.deleted")
                  : line.reasons.length
                    ? `${t(`outcome.${line.outcome}`)}: ${list.format(line.reasons.map(text))}`
                    : line.message ?? t(`outcome.${line.outcome}`)}
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
      <Button
        variant="secondary"
        className="text-error-dark"
        onClick={() => {
          setSummary(null);
          setOpen(true);
        }}
        data-testid="product-delete"
      >
        <Trash2 className="size-4" aria-hidden />
        {t("action")}
      </Button>
      {open ? (
        <SingleDeleteDialog
          id={id}
          name={name}
          onClose={() => setOpen(false)}
          onDone={(result) => {
            setOpen(false);
            if (result.deleted) {
              toast(t("deletedToast", { name }));
              router.push("/catalog/products");
              return;
            }
            setSummary(result);
            router.refresh();
          }}
        />
      ) : null}
      {summary ? (
        <div className="basis-full" data-testid="product-delete-result">
          <ProductDeleteOutcome summary={summary} linkArchived={false} />
        </div>
      ) : null}
    </>
  );
}
