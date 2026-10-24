"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Alert, Button, DialogShell } from "@/components/ui";
import {
  CENTRED,
  cropRect,
  cropStyle,
  hasMargins,
  isLowResolution,
  outputSize,
  type CropState,
  type CropTarget,
} from "@/lib/image-crop";
import { CropError, decodeImage, drawCrop, type Cropped, type Decoded } from "@/lib/image-crop-browser";
import { ImageCropper } from "./image-cropper";

type Loaded =
  | { status: "loading" }
  | { status: "ready"; decoded: Decoded; source: string }
  | { status: "failed"; reason: "decode" | "encode" | "tooLarge" };

/**
 * THE image editor (VIS-021), used wherever one picture is chosen or replaced:
 * product pictures, category artwork, brand logos and banners. It opens on
 * the centred crop at the destination's aspect ratio (1:1 for products,
 * categories and brands; 2:1 for banners), lets the person zoom out or in and
 * drag the picture, previews the result live, and on "Use this image" draws
 * the real output file — square files for square destinations, never a CSS
 * clip. That file is what the caller uploads; nothing re-centres it later.
 *
 * Several pictures picked at once are edited one after another ("Picture 2
 * of 5"). Cancel skips the picture on screen; closing the dialog skips the
 * ones still waiting.
 */
export function ImageEditorDialog({
  files,
  target,
  transparent,
  safeArea = false,
  ratioHint,
  onConfirm,
  onDone,
  testId = "image-editor",
}: {
  /** The pictures to edit, in order; empty means closed. */
  files: readonly File[];
  target: CropTarget;
  /** Margins and transparent pixels stay transparent (categories, logos) rather than white. */
  transparent: boolean;
  safeArea?: boolean;
  /** One line under the title: the destination's ratio and why. */
  ratioHint: string;
  /** Each confirmed picture, as the file to upload. */
  onConfirm: (cropped: Cropped, file: File) => void | Promise<void>;
  /** Every picture was confirmed or skipped (or the dialog was closed). */
  onDone: () => void;
  testId?: string;
}) {
  const t = useTranslations("imageEditor");
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [crop, setCrop] = useState<CropState>(CENTRED);
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState(files);

  // A new batch starts again at its first picture.
  if (batch !== files) {
    setBatch(files);
    setIndex(0);
    setCrop(CENTRED);
    setLoaded({ status: "loading" });
  }

  const file = files[index] ?? null;

  // Decode the picture on screen; release it (and its object URL) after.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let result: { decoded: Decoded; source: string } | null = null;
    decodeImage(file).then(
      (decoded) => {
        const source = URL.createObjectURL(file);
        result = { decoded, source };
        if (cancelled) {
          decoded.bitmap.close();
          URL.revokeObjectURL(source);
          return;
        }
        setLoaded({ status: "ready", decoded, source });
      },
      () => {
        if (!cancelled) setLoaded({ status: "failed", reason: "decode" });
      },
    );
    return () => {
      cancelled = true;
      if (result) {
        result.decoded.bitmap.close();
        URL.revokeObjectURL(result.source);
      }
    };
  }, [file]);

  function next() {
    if (index + 1 >= files.length) {
      onDone();
      return;
    }
    setIndex(index + 1);
    setCrop(CENTRED);
    setLoaded({ status: "loading" });
  }

  async function confirm() {
    if (loaded.status !== "ready" || !file) return;
    setBusy(true);
    try {
      const cropped = await drawCrop(loaded.decoded, target, crop, { keepTransparency: transparent, baseName: file.name });
      await onConfirm(cropped, file);
      next();
    } catch (error) {
      setLoaded({ status: "failed", reason: error instanceof CropError ? error.reason : "encode" });
    } finally {
      setBusy(false);
    }
  }

  const ready = loaded.status === "ready" ? loaded : null;
  const rect = ready ? cropRect(ready.decoded.size, target.aspect, crop) : null;
  const output = rect ? outputSize(rect, target) : null;
  const many = files.length > 1;

  return (
    <DialogShell
      open={file !== null}
      onClose={onDone}
      busy={busy}
      size={target.aspect > 1 ? "lg" : "md"}
      title={many ? t("editTitleMany", { current: index + 1, total: files.length }) : t("editTitle")}
      description={ratioHint}
      testId={testId}
      footer={
        <>
          <Button variant="ghost" onClick={next} disabled={busy} data-testid={`${testId}-cancel`}>
            {many && index + 1 < files.length ? t("skip") : t("cancelCrop")}
          </Button>
          <Button onClick={() => void confirm()} pending={busy} disabled={!ready} data-testid={`${testId}-confirm`}>
            <Check className="size-4" aria-hidden />
            {t("useImage")}
          </Button>
        </>
      }
    >
      {file ? (
        <p className="truncate text-caption text-text-muted" dir="auto" data-testid={`${testId}-file`}>
          {file.name}
        </p>
      ) : null}
      {loaded.status === "loading" ? (
        <p className="text-body text-text-muted" data-testid={`${testId}-loading`}>
          {t("opening")}
        </p>
      ) : null}
      {loaded.status === "failed" ? <Alert data-testid={`${testId}-error`}>{t(`failed.${loaded.reason}`)}</Alert> : null}
      {ready && rect && output ? (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <ImageCropper
            src={ready.source}
            size={ready.decoded.size}
            target={target}
            state={crop}
            onChange={setCrop}
            transparent={transparent}
            safeArea={safeArea}
            testId={`${testId}-cropper`}
          />
          <div className="flex flex-col gap-2 sm:w-36">
            <p className="text-label">{t("result")}</p>
            <div
              className="relative w-full overflow-hidden rounded-md border border-border"
              style={{ aspectRatio: String(target.aspect), backgroundColor: transparent ? undefined : "#ffffff" }}
              data-testid={`${testId}-result`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- the same local picture, positioned like the frame */}
              <img src={ready.source} alt="" className="pointer-events-none absolute max-w-none" style={cropStyle(ready.decoded.size, rect)} />
            </div>
            <p className="text-caption text-text-muted" dir="ltr" data-testid={`${testId}-output-size`}>
              {output.width} × {output.height}
            </p>
            {hasMargins(ready.decoded.size, rect) ? (
              <p className="text-caption text-text-muted" data-testid={`${testId}-margins`}>
                {transparent ? t("marginsTransparent") : t("marginsWhite")}
              </p>
            ) : null}
            {isLowResolution(rect, target) ? (
              <p className="text-caption font-semibold text-warning-dark" data-testid={`${testId}-low-resolution`}>
                {t("lowResolution", { width: target.width })}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </DialogShell>
  );
}
