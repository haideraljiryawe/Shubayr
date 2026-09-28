"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui";
import type { ErrorKind } from "@/lib/api/errors";

/** The translated form-level message for an error kind. */
export function FormError({
  kind,
  detail,
}: {
  kind: ErrorKind | null;
  detail?: string | null;
}) {
  const t = useTranslations("errors");
  if (!kind) return null;
  return (
    <Alert data-testid="form-error" data-kind={kind}>
      <p className="font-semibold">{t(kind)}</p>
      {/* Conflicts carry the API's specific reason (e.g. "Username already
          exists"), which is worth showing verbatim. */}
      {detail && (kind === "conflict" || kind === "validation") ? (
        <p className="mt-1 opacity-90">{detail}</p>
      ) : null}
    </Alert>
  );
}
