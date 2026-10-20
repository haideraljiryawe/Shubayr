"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui";
import type { ErrorKind } from "@/lib/api/errors";

/**
 * The translated form-level message for a failure: the documented code's own
 * message when there is one (errors.codes), otherwise the kind's. The API's
 * English text, stacks and internal details are never shown (NOTE-012).
 */
export function FormError({ kind, code }: { kind: ErrorKind | null; code?: string | null }) {
  const t = useTranslations("errors");
  if (!kind) return null;
  const specific = code && t.has(`codes.${code}`) ? t(`codes.${code}`) : null;
  return (
    <Alert data-testid="form-error" data-kind={kind} data-code={code ?? undefined}>
      <p className="font-semibold">{specific ?? t(kind)}</p>
    </Alert>
  );
}
