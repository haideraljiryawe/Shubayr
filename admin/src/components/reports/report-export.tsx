"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button, DialogShell } from "@/components/ui";
import type { ReportId } from "@/lib/reports";
import { cn } from "@/lib/cn";
import type { components } from "@/types/api";

type Format = components["schemas"]["ReportExportInput"]["format"];
type Orientation = NonNullable<components["schemas"]["ReportExportInput"]["orientation"]>;
type Progress = { id: string; status: "queued" | "processing" | "completed" | "failed"; rows_done: number; rows_total: number; last_error: string | null; download_ready: boolean };

const ORIENTATIONS: Orientation[] = ["portrait", "landscape"];

/**
 * Starts an export job and polls its progress until the file is ready, it
 * fails, or `stopped()` says nobody is waiting any more. Every format runs on
 * the background worker; the file is fetched from its download resource.
 */
async function runExport(
  body: Record<string, unknown>,
  onProgress: (progress: Progress) => void,
  stopped: () => boolean,
): Promise<{ ok: true; progress: Progress } | { ok: false; error: string | null }> {
  const response = await fetch("/api/proxy/admin/reports/exports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { ok: false, error: null };
  let current = await response.json() as Progress;
  onProgress(current);
  for (let attempt = 0; attempt < 120 && !current.download_ready && current.status !== "failed"; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
    if (stopped()) return { ok: false, error: null };
    const polled = await fetch(`/api/proxy/admin/reports/exports/${current.id}/progress`);
    if (!polled.ok) return { ok: false, error: null };
    current = await polled.json() as Progress;
    onProgress(current);
  }
  if (current.download_ready) return { ok: true, progress: current };
  return { ok: false, error: current.status === "failed" ? current.last_error : null };
}

function downloadUrl(id: string) {
  return `/api/proxy/admin/reports/exports/${id}/download`;
}

function startDownload(id: string) {
  const link = document.createElement("a");
  link.href = downloadUrl(id);
  link.download = "";
  link.click();
}

export function exportPercent(progress: Pick<Progress, "rows_done" | "rows_total" | "download_ready"> | null) {
  if (!progress) return 0;
  if (progress.download_ready) return 100;
  if (progress.rows_total <= 0) return 0;
  return Math.min(100, Math.round((progress.rows_done / progress.rows_total) * 100));
}

export function ReportExport({ report, parameters }: { report: ReportId; parameters: Record<string, string | number> }) {
  const t = useTranslations("reports.export");
  const locale = useLocale();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);

  function body(format: Format, extra: Record<string, unknown> = {}) {
    return { report_type: report.replaceAll("-", "_"), format, language: locale === "ar" ? "ar" : "en", ...extra, ...parameters };
  }

  async function start(format: Format) {
    setError(null);
    setProgress(null);
    const result = await runExport(body(format), setProgress, () => false);
    if (result.ok) startDownload(result.progress.id);
    else setError(result.error || t("failed"));
  }

  const pending = progress?.status === "queued" || progress?.status === "processing";
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="report-export">
      <Button size="sm" variant="secondary" pending={pending} onClick={() => start("csv")} data-testid="report-export-csv"><Download className="size-4" aria-hidden />{t("csv")}</Button>
      <Button size="sm" variant="secondary" pending={pending} onClick={() => start("xlsx")} data-testid="report-export-xlsx"><Download className="size-4" aria-hidden />{t("xlsx")}</Button>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => setPdfOpen(true)} data-testid="report-export-pdf"><FileText className="size-4" aria-hidden />{t("pdf")}</Button>
      {progress && pending ? <span className="text-caption text-text-muted" role="status">{t("progress", { done: progress.rows_done, total: progress.rows_total })}</span> : null}
      {error ? <span className="text-caption text-error-dark" role="alert">{error}</span> : null}
      {pdfOpen ? <PdfExportDialog body={(orientation) => body("pdf", { orientation })} onClose={() => setPdfOpen(false)} /> : null}
    </div>
  );
}

/**
 * VIS-020: the PDF export dialog. Portrait or landscape (the server lays the
 * columns out for the chosen page, it does not shrink them), then the job's
 * progress, then the download. Cancel stops waiting; a job already queued
 * still finishes on the server and simply isn't downloaded.
 */
function PdfExportDialog({ body, onClose }: { body: (orientation: Orientation) => Record<string, unknown>; onClose: () => void }) {
  const t = useTranslations("reports.export");
  const tc = useTranslations("common");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [state, setState] = useState<"choose" | "running" | "ready" | "failed">("choose");
  const [error, setError] = useState<string | null>(null);
  const closed = useRef(false);
  // Set on mount as well: a remount (Strict Mode, Fast Refresh) must not
  // leave the dialog thinking it was closed.
  useEffect(() => {
    closed.current = false;
    return () => { closed.current = true; };
  }, []);

  async function exportPdf() {
    setError(null);
    setProgress(null);
    setState("running");
    const result = await runExport(body(orientation), setProgress, () => closed.current);
    if (closed.current) return;
    if (result.ok) {
      setState("ready");
      startDownload(result.progress.id);
    } else {
      setState("failed");
      setError(result.error || t("failed"));
    }
  }

  function close() {
    closed.current = true;
    onClose();
  }

  const value = exportPercent(progress);
  const footer = state === "ready" ? (
    <Button variant="primary" onClick={close} data-testid="pdf-export-close">{tc("close")}</Button>
  ) : (
    <>
      <Button variant="secondary" onClick={close} data-testid="pdf-export-cancel">{tc("cancel")}</Button>
      <Button variant="primary" type="submit" pending={state === "running"} data-testid="pdf-export-submit">
        <FileText className="size-4" aria-hidden />{state === "failed" ? t("pdfRetry") : t("pdfSubmit")}
      </Button>
    </>
  );

  return (
    <DialogShell
      open
      onClose={close}
      title={t("pdfTitle")}
      description={t("pdfDescription")}
      footer={footer}
      size="sm"
      onSubmit={() => { if (state !== "running") void exportPdf(); }}
      testId="pdf-export-dialog"
    >
      <fieldset className="flex flex-col gap-2" disabled={state === "running" || state === "ready"}>
        <legend className="mb-2 text-label text-text">{t("orientation")}</legend>
        <div className="grid grid-cols-2 gap-3">
          {ORIENTATIONS.map((option) => (
            <label
              key={option}
              data-testid={`pdf-orientation-${option}`}
              data-checked={orientation === option}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-2 rounded-md border px-3 py-4 text-center has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary",
                orientation === option ? "border-primary bg-primary/5" : "border-border hover:bg-card",
              )}
            >
              <input
                type="radio"
                name="pdf-orientation"
                value={option}
                checked={orientation === option}
                onChange={() => setOrientation(option)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn("rounded-sm border-2 border-current text-text-muted", option === "portrait" ? "h-10 w-7" : "h-7 w-10")}
              />
              <span className="text-label text-text">{t(option)}</span>
              <span className="text-caption text-text-muted">{t(`${option}Hint`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {state === "running" || state === "ready" ? (
        <div className="flex flex-col gap-1" data-testid="pdf-export-progress" data-state={state}>
          <div className="flex justify-between text-body">
            <span role="status">
              {state === "ready" ? t("pdfReady") : progress ? t("progress", { done: progress.rows_done, total: progress.rows_total }) : t("pdfQueued")}
            </span>
            <span dir="ltr">{value}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-card" role="progressbar" aria-label={t("pdfTitle")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${value}%` }} />
          </div>
          {state === "ready" && progress ? (
            <a className="text-body text-primary underline" href={downloadUrl(progress.id)} download data-testid="pdf-export-download">{t("pdfDownloadAgain")}</a>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-body text-error-dark" role="alert" data-testid="pdf-export-error">{error}</p> : null}
    </DialogShell>
  );
}
