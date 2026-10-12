"use client";

import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, GripVertical, ImagePlus, RotateCcw, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { ImagePrepareError, prepareImage, uploadImage } from "@/lib/media-upload";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_PRODUCT_IMAGES,
  checkImageFile,
  makeMain,
  moveItem,
  type ImageDraft,
  type ImageFailure,
} from "@/lib/product-images";

let tileCounter = 0;

/**
 * The product's pictures: pick several at once (or drop them here), each one
 * shrunk in the browser and uploaded straight away with its progress; a
 * failed one keeps its place and can be retried. The first picture is the
 * main one — "make main" moves a picture to the front — and the order is
 * changed by dragging a picture by its handle (mouse, finger or pen alike)
 * or with the move buttons.
 *
 * The list lives in the editor (it is part of what Save sends); this
 * component only changes it. `single` is the one-picture variant (a brand's
 * logo): a new pick replaces the picture, and there is no order to set.
 */
export function ImageManager({
  images,
  onChange,
  disabled = false,
  single = false,
  testId = "image-manager",
}: {
  images: ImageDraft[];
  onChange: Dispatch<SetStateAction<ImageDraft[]>>;
  disabled?: boolean;
  single?: boolean;
  testId?: string;
}) {
  const t = useTranslations("images");
  const max = single ? 1 : MAX_PRODUCT_IMAGES;
  const input = useRef<HTMLInputElement>(null);
  const objectUrls = useRef(new Set<string>());
  const [dropping, setDropping] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const patch = (key: string, change: Partial<ImageDraft>) =>
    onChange((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)));

  async function send(key: string, blob: Blob, name: string) {
    patch(key, { phase: "uploading", progress: 0, failure: undefined, file: blob, name });
    try {
      const media = await uploadImage(blob, name, (progress) => patch(key, { progress }));
      patch(key, { phase: "ready", progress: 100, url: media.public_url, file: undefined });
    } catch (cause) {
      const failure: ImageFailure =
        cause instanceof ApiError && cause.status === 403
          ? "forbidden"
          : cause instanceof ApiError && cause.status === 413
            ? "tooLarge"
            : cause instanceof ApiError && cause.status === 415
              ? "type"
              : "upload";
      patch(key, { phase: "failed", failure });
    }
  }

  async function process(key: string, file: File) {
    try {
      const prepared = await prepareImage(file);
      await send(key, prepared.blob, prepared.name);
    } catch (cause) {
      patch(key, {
        phase: "failed",
        failure: cause instanceof ImagePrepareError ? (cause.reason === "tooLarge" ? "tooLarge" : "decode") : "upload",
      });
    }
  }

  function add(files: FileList | File[]) {
    const picked = [...files];
    if (!picked.length) return;
    const room = single ? 1 : Math.max(0, max - images.length);
    setNotice(!single && picked.length > room ? t("tooMany", { max }) : null);
    const queue: Array<{ key: string; file: File }> = [];
    const tiles: ImageDraft[] = picked.slice(0, room).map((file) => {
      tileCounter += 1;
      const key = `new-image-${tileCounter}`;
      const preview = URL.createObjectURL(file);
      objectUrls.current.add(preview);
      const failure = checkImageFile(file);
      if (!failure) queue.push({ key, file });
      return failure
        ? { key, preview, phase: "failed" as const, progress: 0, failure, name: file.name }
        : { key, preview, phase: "processing" as const, progress: 0, name: file.name };
    });
    onChange((list) => (single ? tiles : [...list, ...tiles]));
    // One at a time: a phone's worth of photos must not race the rate limit.
    void (async () => {
      for (const item of queue) await process(item.key, item.file);
    })();
  }

  function retry(item: ImageDraft) {
    if (item.file) void send(item.key, item.file, item.name ?? "image");
  }

  function remove(item: ImageDraft) {
    if (item.preview.startsWith("blob:")) {
      URL.revokeObjectURL(item.preview);
      objectUrls.current.delete(item.preview);
    }
    onChange((list) => list.filter((entry) => entry.key !== item.key));
  }

  /** Pointer drag: the tile under the pointer takes the dragged picture. */
  function dragOver(clientX: number, clientY: number) {
    if (!dragKey) return;
    const tile = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-image-index]");
    if (!tile || !tile.closest(`[data-testid="${testId}"]`)) return;
    const target = Number(tile.dataset.imageIndex);
    onChange((list) => {
      const from = list.findIndex((item) => item.key === dragKey);
      return from < 0 || from === target ? list : moveItem(list, from, target);
    });
  }

  const failureText = (failure: ImageFailure | undefined) => t(`failure.${failure ?? "upload"}`);

  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-6 text-center transition-colors",
          dropping && "border-primary bg-primary/5",
          disabled && "opacity-60",
        )}
        onDragOver={(event) => {
          if (disabled || !event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(event) => {
          if (disabled) return;
          event.preventDefault();
          setDropping(false);
          add(event.dataTransfer.files);
        }}
        data-testid={`${testId}-drop`}
      >
        <ImagePlus className="size-7 text-text-muted" aria-hidden />
        <p className="text-sm font-semibold">{single ? t("dropTitleSingle") : t("dropTitle")}</p>
        <p className="text-xs text-text-muted">{single ? t("dropHintSingle") : t("dropHint", { max })}</p>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || (!single && images.length >= max)}
          onClick={() => input.current?.click()}
          data-testid={`${testId}-pick`}
        >
          {single && images.length ? t("replace") : t("pick")}
        </Button>
        <input
          ref={input}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          multiple={!single}
          className="sr-only"
          tabIndex={-1}
          aria-label={t("pick")}
          onChange={(event) => {
            if (event.target.files) add(event.target.files);
            event.target.value = "";
          }}
          data-testid={`${testId}-input`}
        />
      </div>
      {notice ? (
        <p className="text-sm text-warning-dark" role="status">
          {notice}
        </p>
      ) : null}

      {images.length ? (
        <>
          {single ? null : <p className="text-xs text-text-muted">{t("orderHint")}</p>}
          <ol
            className={cn("grid gap-3", single ? "w-40 grid-cols-1" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4")}
            onPointerMove={(event) => dragOver(event.clientX, event.clientY)}
            onPointerUp={() => setDragKey(null)}
            onPointerCancel={() => setDragKey(null)}
            aria-label={t("listLabel")}
          >
            {images.map((item, index) => (
              <li
                key={item.key}
                data-image-index={index}
                data-testid={`${testId}-tile-${index}`}
                data-phase={item.phase}
                data-url={item.url ?? ""}
                className={cn(
                  "relative flex flex-col overflow-hidden rounded-lg border bg-surface",
                  index === 0 ? "border-primary ring-1 ring-primary" : "border-border",
                  dragKey === item.key && "opacity-60 ring-2 ring-primary",
                )}
              >
                <div className="relative aspect-square bg-card">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local previews and API media URLs */}
                  <img src={item.preview} alt={t("imageAlt", { number: index + 1 })} className="size-full object-contain" draggable={false} />
                  {index === 0 && !single ? (
                    <span className="absolute start-2 top-2 rounded-full bg-primary-dark px-2 py-0.5 text-xs font-semibold text-on-primary" data-testid={`${testId}-main-badge`}>
                      {t("main")}
                    </span>
                  ) : null}
                  {item.phase === "processing" || item.phase === "uploading" ? (
                    <div className="absolute inset-x-0 bottom-0 bg-surface/90 px-2 py-1.5" aria-live="polite">
                      <p className="text-xs font-semibold">
                        {item.phase === "processing" ? t("processing") : t("uploading", { progress: item.progress })}
                      </p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full bg-primary transition-[width]"
                          style={{ width: `${item.phase === "processing" ? 5 : item.progress}%` }}
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={item.progress}
                          data-testid={`${testId}-progress-${index}`}
                        />
                      </div>
                    </div>
                  ) : null}
                  {item.phase === "failed" ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface/90 p-2 text-center" role="alert">
                      <p className="text-xs font-semibold text-error-dark" data-testid={`${testId}-failure-${index}`}>
                        {failureText(item.failure)}
                      </p>
                      {item.file ? (
                        <Button size="sm" variant="secondary" onClick={() => retry(item)} data-testid={`${testId}-retry-${index}`}>
                          <RotateCcw className="size-4" aria-hidden />
                          {t("retry")}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center justify-between gap-1 border-t border-border px-1 py-1">
                  {single ? (
                    <span />
                  ) : (
                    <button
                      type="button"
                      className="inline-flex size-9 cursor-grab touch-none items-center justify-center rounded-md text-text-muted hover:bg-card active:cursor-grabbing"
                      aria-label={t("drag")}
                      title={t("drag")}
                      disabled={disabled}
                      onPointerDown={(event) => {
                        if (disabled || images.length < 2) return;
                        // A touch captures the pointer to the handle; release it
                        // so the tiles under the finger see the move.
                        event.currentTarget.releasePointerCapture?.(event.pointerId);
                        setDragKey(item.key);
                      }}
                      data-testid={`${testId}-drag-${index}`}
                    >
                      <GripVertical className="size-4" aria-hidden />
                    </button>
                  )}
                  <div className="flex items-center">
                    {single ? null : (
                      <>
                        <IconButton
                          label={t("earlier")}
                          disabled={disabled || index === 0}
                          onClick={() => onChange((list) => moveItem(list, index, index - 1))}
                          testId={`${testId}-earlier-${index}`}
                        >
                          <ChevronRight className="size-4 ltr:rotate-180" aria-hidden />
                        </IconButton>
                        <IconButton
                          label={t("later")}
                          disabled={disabled || index === images.length - 1}
                          onClick={() => onChange((list) => moveItem(list, index, index + 1))}
                          testId={`${testId}-later-${index}`}
                        >
                          <ChevronLeft className="size-4 ltr:rotate-180" aria-hidden />
                        </IconButton>
                        <IconButton
                          label={index === 0 ? t("isMain") : t("makeMain")}
                          disabled={disabled || index === 0}
                          onClick={() => onChange((list) => makeMain(list, item.key))}
                          testId={`${testId}-make-main-${index}`}
                        >
                          <Star className={cn("size-4", index === 0 && "fill-current text-primary-dark")} aria-hidden />
                        </IconButton>
                      </>
                    )}
                    <IconButton
                      label={t("remove")}
                      disabled={disabled}
                      onClick={() => remove(item)}
                      testId={`${testId}-remove-${index}`}
                      danger
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </IconButton>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="text-sm text-text-muted" data-testid={`${testId}-empty`}>
          {single ? t("emptySingle") : t("empty")}
        </p>
      )}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  testId,
  danger = false,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  testId: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md hover:bg-card disabled:cursor-not-allowed disabled:opacity-40",
        danger ? "text-error-dark" : "text-text",
      )}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
