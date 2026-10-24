"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ImageMinus, ImagePlus, RotateCcw, Undo2 } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/product-images";
import type { CropTarget } from "@/lib/image-crop";
import type { Cropped } from "@/lib/image-crop-browser";
import { ImageEditorDialog } from "./image-editor-dialog";
import { useRatioHint } from "./ratio-hint";

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

/**
 * Pick → the shared image editor (VIS-021) at the destination's ratio → a
 * local preview of the exact file. Nothing is uploaded here: the form uploads
 * the cropped file when it saves, so cancelling the form leaves no stray
 * upload, and a failed upload keeps the saved image.
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
  const ratioHint = useRatioHint(target);
  const input = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<File[]>([]);
  const [failed, setFailed] = useState<"type" | "tooLarge" | null>(null);

  // The preview's object URL is released when replaced or when the form goes away.
  const previewUrl = value.kind === "new" ? value.preview : null;
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function pick(file: File | undefined) {
    if (!file) return;
    if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setFailed("type");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setFailed("tooLarge");
      return;
    }
    setFailed(null);
    setEditing([file]);
  }

  const shown = value.kind === "new" ? value.preview : value.kind === "remove" ? null : savedUrl;

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
          pick(event.target.files?.[0]);
          event.target.value = "";
        }}
        data-testid={`${testId}-input`}
      />

      <ImageEditorDialog
        files={editing}
        target={target}
        transparent={keepTransparency}
        safeArea={safeArea}
        ratioHint={ratioHint}
        onConfirm={(cropped) => onChange({ kind: "new", cropped, preview: URL.createObjectURL(cropped.blob) })}
        onDone={() => setEditing([])}
        testId={`${testId}-editor`}
      />

      <div data-testid={`${testId}-preview`} data-state={value.kind}>
        {preview(shown)}
      </div>
      {failed ? <Alert data-testid={`${testId}-error`}>{t(`failed.${failed}`)}</Alert> : null}
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
    </fieldset>
  );
}
