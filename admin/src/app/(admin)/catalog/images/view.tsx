"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CircleHelp, ImageOff, Upload } from "lucide-react";
import { Alert, Button, Card, Input } from "@/components/ui";
import { ApiError } from "@/lib/api/errors";
import { groupMatched, looksLikeZip, type ImageResult } from "@/lib/catalog-import";
import { postFile } from "@/lib/file-upload";
import { OperationKey } from "@/lib/finance/cash-receipts";

/**
 * Upload a ZIP of pictures named by SKU (SKU.jpg, SKU-2.jpg …) with upload
 * progress, then report what matched — grouped by product, with links — and
 * which files matched no SKU. One operation id per chosen file, so a retry
 * after a lost answer replays instead of adding the pictures twice.
 */
export function BulkImagesView() {
  const t = useTranslations("catalogImages");
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<{ phase: "uploading" | "processing"; percent: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<ImageResult | null>(null);
  const operation = useRef(new OperationKey(() => `images-${crypto.randomUUID()}`));
  // Changing the key empties the file input after an upload.
  const [inputKey, setInputKey] = useState(0);

  function errorText(cause: unknown): string {
    if (cause instanceof ApiError) {
      if (cause.code && t.has(`errors.${cause.code}`)) return t(`errors.${cause.code}`);
      if (cause.status === 413) return t("errors.tooLarge");
      if (cause.message) return cause.message;
    }
    return t("errors.generic");
  }

  async function send() {
    if (!file) {
      setProblem(t("chooseZip"));
      return;
    }
    if (!looksLikeZip(file)) {
      setProblem(t("notZip"));
      return;
    }
    setProblem(null);
    setResult(null);
    setUpload({ phase: "uploading", percent: 0 });
    const operationId = operation.current.id(`${file.name}:${file.size}:${file.lastModified}`);
    try {
      const answer = await postFile<ImageResult>(`/api/catalog-images/bulk?operation_id=${encodeURIComponent(operationId)}`, file, file.name, {
        onProgress: (percent) => setUpload((now) => (now?.phase === "uploading" ? { phase: "uploading", percent } : now)),
        onUploaded: () => setUpload({ phase: "processing", percent: 100 }),
      });
      operation.current.reset();
      setResult(answer);
      setFile(null);
      setInputKey((key) => key + 1);
    } catch (cause) {
      setProblem(errorText(cause));
    } finally {
      setUpload(null);
    }
  }

  const groups = result ? groupMatched(result.matched) : [];

  return (
    <div className="flex flex-col gap-6" data-testid="bulk-images">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {t("file")}
            <Input
              key={inputKey}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              className="h-auto py-2"
              disabled={upload !== null}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setProblem(null);
              }}
              data-testid="images-file"
            />
          </label>
          {upload ? (
            upload.phase === "uploading" ? (
              <div className="flex flex-col gap-1" data-testid="images-upload-progress">
                <span className="text-sm">{t("uploading", { percent: upload.percent })}</span>
                <div
                  className="h-2 overflow-hidden rounded-full bg-card"
                  role="progressbar"
                  aria-label={t("uploading", { percent: upload.percent })}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={upload.percent}
                >
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${upload.percent}%` }} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted" role="status" data-testid="images-processing">
                {t("processing")}
              </p>
            )
          ) : null}
          <Button className="self-start" onClick={() => void send()} pending={upload !== null} data-testid="images-upload">
            <Upload className="size-4" aria-hidden />
            {t("upload")}
          </Button>
        </Card>

        <Card className="flex flex-col gap-2 p-4 text-sm leading-relaxed" data-testid="images-help">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <CircleHelp className="size-5 text-primary" aria-hidden />
            {t("naming.title")}
          </h2>
          <p>{t("naming.body")}</p>
          <p className="text-text-muted">{t("naming.formats")}</p>
          <p className="text-text-muted">
            {t("naming.examples")}{" "}
            <code dir="ltr" className="rounded bg-card px-1.5 py-0.5 text-xs">
              TSHIRT-RED-M.jpg, TSHIRT-RED-M-2.jpg, MUG-01.png
            </code>
          </p>
        </Card>
      </div>

      {problem ? <Alert data-testid="images-problem">{problem}</Alert> : null}

      {result ? (
        <Card className="flex flex-col gap-4 p-4" data-testid="images-result">
          <h2 className="text-lg font-semibold">{t("result.title")}</h2>
          <Alert tone={result.unmatched.length ? "info" : "success"}>
            <p className="font-semibold" data-testid="images-matched-count" data-count={result.matched.length}>
              {t("result.matched", { count: result.matched.length })}
              {groups.length ? ` ${t("result.products", { count: groups.length })}` : ""}
            </p>
            <p data-testid="images-unmatched-count" data-count={result.unmatched.length}>
              {t("result.unmatched", { count: result.unmatched.length })}
            </p>
          </Alert>

          {groups.length ? (
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">{t("result.matchedTitle")}</h3>
              <ul className="grid gap-2 md:grid-cols-2" data-testid="images-matched">
                {groups.map((group) => (
                  <li key={group.productId} className="flex items-center gap-3 rounded-md border border-border p-2" data-testid="images-matched-product" data-sku={group.sku}>
                    <div className="flex shrink-0 gap-1">
                      {group.files.slice(0, 3).map((item) => (
                        // eslint-disable-next-line @next/next/no-img-element -- API media URLs
                        <img key={item.url} src={item.url} alt="" className="size-12 rounded border border-border object-cover" loading="lazy" />
                      ))}
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-mono text-xs font-semibold" dir="ltr">
                        {group.sku}
                      </p>
                      <p className="text-text-muted">{t("result.files", { count: group.files.length })}</p>
                      <p className="truncate text-xs text-text-muted" dir="ltr" title={group.files.map((item) => item.file).join(", ")}>
                        {group.files.map((item) => item.file).join(", ")}
                      </p>
                    </div>
                    <Link href={`/catalog/products/${group.productId}`} className="shrink-0 text-sm font-semibold text-primary-dark hover:underline" data-testid="images-product-link">
                      {t("result.open")}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {result.unmatched.length ? (
            <section className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 font-semibold">
                <ImageOff className="size-4" aria-hidden />
                {t("result.unmatchedTitle")}
              </h3>
              <p className="text-sm text-text-muted">{t("result.unmatchedHelp")}</p>
              <ul className="flex flex-wrap gap-2" data-testid="images-unmatched">
                {result.unmatched.map((name) => (
                  <li key={name} className="rounded bg-card px-2 py-1 font-mono text-xs" dir="ltr" data-testid="images-unmatched-file">
                    {name}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
