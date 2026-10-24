"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import type { ReportId } from "@/lib/reports";

type Format = "csv" | "xlsx";
type Progress = { id: string; status: "queued" | "processing" | "completed" | "failed"; rows_done: number; rows_total: number; last_error: string | null; download_ready: boolean };

export function ReportExport({ report, parameters }: { report: ReportId; parameters: Record<string, string | number> }) {
  const t = useTranslations("reports.export");
  const locale = useLocale();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(format: Format) {
    setError(null);
    setProgress(null);
    const response = await fetch("/api/proxy/admin/reports/exports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_type: report.replaceAll("-", "_"), format, language: locale === "ar" ? "ar" : "en", ...parameters }),
    });
    if (!response.ok) return setError(t("failed"));
    let current = await response.json() as Progress;
    setProgress(current);
    for (let attempt = 0; attempt < 120 && !current.download_ready && current.status !== "failed"; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      const polled = await fetch(`/api/proxy/admin/reports/exports/${current.id}/progress`);
      if (!polled.ok) return setError(t("failed"));
      current = await polled.json() as Progress;
      setProgress(current);
    }
    if (current.download_ready) {
      const link = document.createElement("a");
      link.href = `/api/proxy/admin/reports/exports/${current.id}/download`;
      link.download = "";
      link.click();
    }
    else if (current.status === "failed") setError(current.last_error || t("failed"));
  }

  const pending = progress?.status === "queued" || progress?.status === "processing";
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="report-export">
      <Button size="sm" variant="secondary" pending={pending} onClick={() => start("csv")}><Download className="size-4" aria-hidden />{t("csv")}</Button>
      <Button size="sm" variant="secondary" pending={pending} onClick={() => start("xlsx")}><Download className="size-4" aria-hidden />{t("xlsx")}</Button>
      {progress && pending ? <span className="text-caption text-text-muted" role="status">{t("progress", { done: progress.rows_done, total: progress.rows_total })}</span> : null}
      {error ? <span className="text-caption text-error-dark" role="alert">{error}</span> : null}
    </div>
  );
}

