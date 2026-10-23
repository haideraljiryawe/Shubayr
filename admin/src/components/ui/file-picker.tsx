"use client";

import { useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { buttonClasses } from "./button-classes";

/* ---------------------------------------------------------------------------
 * FilePicker — the general file-selection control (VIS-024): Excel imports,
 * the bulk-image ZIP, receipts. Not the image editor (VIS-021).
 *
 * The browser's own "Choose File / No file chosen" field follows the
 * browser's language, not the admin's. This wraps the native input (still
 * there, visually hidden, so keyboard, screen readers and Playwright's
 * setInputFiles keep working) with a translated button and a separate status
 * area that shows the real filename — untranslated, isolated so a mixed
 * Arabic/Latin name keeps its reading order, truncated with the full name in
 * its title. Cancelling the system dialog keeps the previous selection.
 * Accepted types, size checks and single/multiple rules stay with the caller.
 * ------------------------------------------------------------------------- */

/** Anything with a filename: a File, or a file already uploaded. */
type Named = { readonly name: string };

export function FilePicker({
  accept,
  multiple = false,
  disabled = false,
  onFiles,
  selected,
  id,
  className,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  "data-testid": testId,
}: {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Called with the new selection; never with an empty one. */
  onFiles: (files: File[]) => void;
  /**
   * What to show as selected when the caller owns the selection (e.g. it is
   * cleared after a successful upload). Left undefined, the picker remembers
   * the last selection itself.
   */
  selected?: readonly Named[] | Named | null;
  id?: string;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "data-testid"?: string;
}) {
  const t = useTranslations("filePicker");
  const input = useRef<HTMLInputElement>(null);
  const [own, setOwn] = useState<File[]>([]);
  const files: readonly Named[] =
    selected === undefined ? own : selected === null ? [] : Array.isArray(selected) ? selected : [selected as Named];
  const statusId = `${id ?? testId ?? "file"}-status`;

  const status =
    files.length === 0
      ? t("none")
      : files.length === 1
        ? files[0].name
        : t("count", { count: files.length });

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <input
        ref={input}
        type="file"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        data-testid={testId}
        onChange={(event) => {
          const list = Array.from(event.target.files ?? []);
          // Allow choosing the same file again after an upload.
          event.target.value = "";
          if (list.length === 0) return; // the system dialog was cancelled
          setOwn(list);
          onFiles(list);
        }}
      />
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-describedby={[statusId, describedBy].filter(Boolean).join(" ")}
        data-invalid={invalid === true || invalid === "true" ? "true" : undefined}
        data-testid={testId ? `${testId}-button` : undefined}
        onClick={() => input.current?.click()}
        className={buttonClasses({ variant: "secondary", className: "data-[invalid=true]:border-error data-[invalid=true]:text-error-dark" })}
      >
        <Paperclip className="size-4" aria-hidden />
        {multiple ? t("chooseMany") : t("choose")}
      </button>
      <p
        id={statusId}
        aria-live="polite"
        title={files.length === 1 ? files[0].name : undefined}
        className={cn(
          "min-w-0 max-w-full flex-1 truncate text-body",
          files.length === 0 ? "text-text-muted" : "font-semibold text-text",
        )}
        data-testid={testId ? `${testId}-status` : undefined}
      >
        {files.length === 1 ? <bdi>{status}</bdi> : status}
      </p>
    </div>
  );
}
