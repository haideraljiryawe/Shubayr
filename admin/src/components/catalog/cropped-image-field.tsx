"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ImageMinus, ImagePlus, RotateCcw, Scissors, Undo2 } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/product-images";
import { CENTRED, cropRect, isLowResolution, type CropState, type CropTarget } from "@/lib/image-crop";
import { CropError, decodeImage, drawCrop, type Cropped, type Decoded } from "@/lib/image-crop-browser";
import { ImageCropper } from "./image-cropper";

/**
 * What the form should do with the picture on save:
 * - keep: leave the saved one alone (or none);
 * - remove: clear it (the media object itself is never deleted);
 * - new: upload this cropped file, then save its URL.
 */
export type ImageChoice =
  | { kind: "keep" }
  | { kind: "remove" }
  | { kind: "new"; cropped: Cropped; preview: string };

type Stage =
  | { step: "idle" }
  | { step: "cropping"; decoded: Decoded; source: string; name: string; crop: CropState }
  | { step: "failed"; reason: "type" | "tooLarge" | "decode" | "encode" };

/**
 * Pick → local preview → square/2:1 crop → "use this crop". Nothing is
 * uploaded here: the form uploads the cropped file when it saves, so cancelling
 * the form leaves no stray upload, and a failed upload keeps the saved image.
 */
export function CroppedImageField({
  label,
  savedUrl,
  value,
  onChange,
  target,
  keepTransparency,
  removable,
  safeArea = false,
  guidance,
  preview,
  testId,
}: {
  label: ReactNode;
  savedUrl: string | null;
  value: ImageChoice;
  onChange: (value: ImageChoice) => void;
  target: CropTarget;
  keepTransparency: boolean;
  /** Offer "Remove image" (categories); a banner always needs one. */
  removable: boolean;
  safeArea?: boolean;
  /** Dimension/format/size advice under the label. */
  guidance: ReactNode;
  /** Renders the previews for the picture as it will be saved (or null for none). */
  preview: (url: string | null) => ReactNode;
  testId: string;
}) {
  const t = useTranslations("imageEditor");
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ step: "idle" });
  const [busy, setBusy] = useState(false);

  // Object URLs are released when replaced or when the form goes away.
  const sourceUrl = stage.step === "cropping" ? stage.source : null;
  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  }, [sourceUrl]);
  const previewUrl = value.kind === "new" ? value.preview : null;
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);
  // The decoded picture lives as long as this crop session, not each drag.
  const decoded = stage.step === "cropping" ? stage.decoded : null;
  useEffect(() => () => decoded?.bitmap.close(), [decoded]);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setStage({ step: "failed", reason: "type" });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setStage({ step: "failed", reason: "tooLarge" });
      return;
    }
    try {
      const decoded = await decodeImage(file);
      setStage({ step: "cropping", decoded, source: URL.createObjectURL(file), name: file.name, crop: CENTRED });
    } catch {
      setStage({ step: "failed", reason: "decode" });
    }
  }

  async function applyCrop() {
    if (stage.step !== "cropping") return;
    setBusy(true);
    try {
      const cropped = await drawCrop(stage.decoded, target, stage.crop, { keepTransparency, baseName: stage.name });
      onChange({ kind: "new", cropped, preview: URL.createObjectURL(cropped.blob) });
      setStage({ step: "idle" });
    } catch (error) {
      setStage({ step: "failed", reason: error instanceof CropError && error.reason === "tooLarge" ? "tooLarge" : "encode" });
    } finally {
      setBusy(false);
    }
  }

  const shown = value.kind === "new" ? value.preview : value.kind === "remove" ? null : savedUrl;
  const low = stage.step === "cropping" && isLowResolution(cropRect(stage.decoded.size, target.aspect, stage.crop), target);

  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3" data-testid={testId}>
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <p className="text-xs text-text-muted" data-testid={`${testId}-guidance`}>
        {guidance}
      </p>

      <input
        ref={input}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = "";
        }}
        data-testid={`${testId}-input`}
      />

      {stage.step === "cropping" ? (
        <div className="flex flex-col gap-2">
          <ImageCropper
            src={stage.source}
            size={stage.decoded.size}
            target={target}
            state={stage.crop}
            onChange={(crop) => setStage({ ...stage, crop })}
            safeArea={safeArea}
            testId={`${testId}-cropper`}
          />
          {low ? (
            <p className="text-xs font-semibold text-warning-dark" data-testid={`${testId}-low-resolution`}>
              {t("lowResolution", { width: target.width })}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void applyCrop()} pending={busy} data-testid={`${testId}-use-crop`}>
              <Scissors className="size-4" aria-hidden />
              {t("useCrop")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStage({ step: "idle" })} disabled={busy}>
              {t("cancelCrop")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div data-testid={`${testId}-preview`} data-state={value.kind}>
            {preview(shown)}
          </div>
          {stage.step === "failed" ? (
            <Alert data-testid={`${testId}-error`}>{t(`failed.${stage.reason}`)}</Alert>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => input.current?.click()} data-testid={`${testId}-pick`}>
              <ImagePlus className="size-4" aria-hidden />
              {shown ? t("replace") : t("choose")}
            </Button>
            {value.kind === "new" ? (
              <Button size="sm" variant="ghost" onClick={() => onChange({ kind: "keep" })} data-testid={`${testId}-discard`}>
                <RotateCcw className="size-4" aria-hidden />
                {savedUrl ? t("keepSaved") : t("discard")}
              </Button>
            ) : null}
            {removable && value.kind === "keep" && savedUrl ? (
              <Button size="sm" variant="ghost" className="text-error-dark" onClick={() => onChange({ kind: "remove" })} data-testid={`${testId}-remove`}>
                <ImageMinus className="size-4" aria-hidden />
                {t("remove")}
              </Button>
            ) : null}
            {value.kind === "remove" ? (
              <Button size="sm" variant="ghost" onClick={() => onChange({ kind: "keep" })} data-testid={`${testId}-undo-remove`}>
                <Undo2 className="size-4" aria-hidden />
                {t("undoRemove")}
              </Button>
            ) : null}
          </div>
          {value.kind === "remove" ? (
            <p className="text-xs text-text-muted" data-testid={`${testId}-remove-note`}>
              {t("removeNote")}
            </p>
          ) : null}
          {value.kind === "new" ? (
            <p className="text-xs text-text-muted" data-testid={`${testId}-pending`}>
              {t("pending", { width: value.cropped.size.width, height: value.cropped.size.height })}
            </p>
          ) : null}
        </>
      )}
    </fieldset>
  );
}
