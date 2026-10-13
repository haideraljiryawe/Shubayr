"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { components } from "@/types/api";
import { Alert, Badge, Button, Card, Input, buttonClasses } from "@/components/ui";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError, toApiError } from "@/lib/api/errors";

type Import = components["schemas"]["CatalogImport"];
type ImageResult = components["schemas"]["CatalogImageBulkResult"];

async function jsonRequest<T>(url: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(url, { method: "POST", body: form });
  const body = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) throw toApiError(response.status, body);
  return body as T;
}

export function CatalogImportView({ initialHistory }: { initialHistory: Import[] }) {
  const t = useTranslations("products.import");
  const [workbook, setWorkbook] = useState<File | null>(null);
  const [archive, setArchive] = useState<File | null>(null);
  const [createMissing, setCreateMissing] = useState(false);
  const [current, setCurrent] = useState<Import | null>(null);
  const [history, setHistory] = useState(initialHistory);
  const [busy, setBusy] = useState<"preview" | "commit" | "images" | null>(null);
  const [message, setMessage] = useState<{ tone: "danger" | "success" | "info"; text: string } | null>(null);
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (poll.current) clearTimeout(poll.current); }, []);

  function remember(value: Import) {
    setCurrent(value);
    setHistory((rows) => [value, ...rows.filter((row) => row.id !== value.id)]);
  }

  async function refresh(id: string) {
    try {
      const value = await unwrap(browserApi.GET("/admin/catalog-imports/{id}", { params: { path: { id } } }));
      remember(value);
      if (["queued", "validating"].includes(value.status)) {
        poll.current = setTimeout(() => void refresh(id), 1_000);
      } else {
        setBusy(null);
      }
    } catch (cause) {
      setBusy(null);
      setMessage({ tone: "danger", text: cause instanceof ApiError ? cause.message : String(cause) });
    }
  }

  async function preview() {
    if (!workbook) return setMessage({ tone: "danger", text: t("chooseFile") });
    setBusy("preview");
    setMessage(null);
    try {
      const value = await jsonRequest<Import>(
        `/api/catalog-imports/preview?create_missing=${createMissing}`,
        workbook,
      );
      remember(value);
      if (["queued", "validating"].includes(value.status)) {
        poll.current = setTimeout(() => void refresh(value.id), 1_000);
      } else {
        setBusy(null);
      }
    } catch (cause) {
      setBusy(null);
      setMessage({ tone: "danger", text: cause instanceof ApiError ? cause.message : String(cause) });
    }
  }

  async function commit() {
    if (!current) return;
    setBusy("commit");
    setMessage(null);
    try {
      await unwrap(browserApi.POST("/admin/catalog-imports/{id}/commit", {
        params: { path: { id: current.id } },
        body: { operation_id: crypto.randomUUID() },
      }));
      const value = await unwrap(browserApi.GET("/admin/catalog-imports/{id}", { params: { path: { id: current.id } } }));
      remember(value);
      setMessage({ tone: "success", text: t("done") });
    } catch (cause) {
      setMessage({ tone: "danger", text: cause instanceof ApiError ? cause.message : String(cause) });
    } finally {
      setBusy(null);
    }
  }

  async function uploadImages() {
    if (!archive) return setMessage({ tone: "danger", text: t("chooseZip") });
    setBusy("images");
    setMessage(null);
    try {
      const result = await jsonRequest<ImageResult>(
        `/api/catalog-images/bulk?operation_id=${encodeURIComponent(crypto.randomUUID())}`,
        archive,
      );
      setMessage({ tone: "success", text: t("imageDone", { matched: result.matched.length, unmatched: result.unmatched.length }) });
    } catch (cause) {
      setMessage({ tone: "danger", text: cause instanceof ApiError ? cause.message : String(cause) });
    } finally {
      setBusy(null);
    }
  }

  const counts = current?.preview?.counts;
  return (
    <div className="space-y-6">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="space-y-4">
          <a href="/api/catalog-imports/template" className={buttonClasses({ variant: "secondary" })}>{t("download")}</a>
          <label className="block space-y-2 text-sm font-semibold">
            <span>{t("workbook")}</span>
            <Input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setWorkbook(event.target.files?.[0] ?? null)} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={createMissing} onChange={(event) => setCreateMissing(event.target.checked)} />
            {t("createMissing")}
          </label>
          <Button onClick={() => void preview()} pending={busy === "preview"}>{busy === "preview" ? t("validating") : t("preview")}</Button>
        </Card>
        <Card className="space-y-4">
          <div><h2 className="font-bold">{t("images")}</h2><p className="text-sm text-text-muted">{t("imagesHelp")}</p></div>
          <Input type="file" accept=".zip,application/zip" onChange={(event) => setArchive(event.target.files?.[0] ?? null)} />
          <Button onClick={() => void uploadImages()} pending={busy === "images"}>{t("uploadImages")}</Button>
        </Card>
      </div>
      {current ? (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold">{current.file_name}</h2>
            <Badge tone={current.status === "failed" ? "danger" : current.status === "completed" ? "success" : "info"}>{current.status} · {current.progress}%</Badge>
            {current.error_report_key ? <a className="text-sm font-semibold text-primary-dark underline" href={`/api/proxy/admin/catalog-imports/${current.id}/error-report`}>{t("errors")}</a> : null}
          </div>
          {counts ? (
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              <span>{t("rows")}: {counts.total}</span><span>{t("created")}: {counts.create}</span><span>{t("updated")}: {counts.update}</span><span>{t("warnings")}: {counts.warning}</span><span>{t("failed")}: {counts.error}</span>
            </div>
          ) : null}
          {current.preview ? (
            <div className="max-h-[28rem] overflow-auto rounded-md border border-border">
              <table className="w-full text-sm"><thead className="sticky top-0 bg-card"><tr><th className="p-2 text-start">#</th><th className="p-2 text-start">SKU</th><th className="p-2 text-start">Action</th><th className="p-2 text-start">Details</th></tr></thead><tbody>
                {current.preview.rows.map((row) => <tr className="border-t border-border" key={`${row.sheet}-${row.row}`}><td className="p-2">{row.sheet}!{row.row}</td><td className="p-2">{row.sku}</td><td className="p-2"><Badge tone={row.action === "error" ? "danger" : row.action === "warning" ? "warning" : "success"}>{row.action}</Badge></td><td className="p-2">{row.issues.map((issue) => `${issue.cell}: ${issue.message}`).join(" · ") || "—"}</td></tr>)}
              </tbody></table>
            </div>
          ) : null}
          {current.status === "ready" && counts && counts.create + counts.update > 0 ? <Button onClick={() => void commit()} pending={busy === "commit"}>{busy === "commit" ? t("committing") : t("commit")}</Button> : null}
        </Card>
      ) : null}
      <Card className="space-y-3"><h2 className="font-bold">{t("history")}</h2>{history.map((row) => <button type="button" className="flex w-full items-center justify-between rounded-md border border-border p-3 text-start hover:bg-card" key={row.id} onClick={() => setCurrent(row)}><span>{row.file_name}</span><Badge>{row.status}</Badge></button>)}</Card>
    </div>
  );
}
