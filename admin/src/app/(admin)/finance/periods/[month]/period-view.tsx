"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2, CircleAlert, Info } from "lucide-react";
import { Alert, Badge, Button, Card, PageHeader, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { useApiForm } from "@/components/forms/use-api-form";
import { browserApi, unwrap } from "@/lib/api/client";
import type { PeriodClose, PeriodRow } from "@/lib/finance/periods";
import type { components } from "@/types/api";

type Checklist = components["schemas"]["PeriodChecklist"];

export function PeriodView({
  period,
  checklist,
  canClose,
  canReopen,
  isFuture,
}: {
  period: PeriodRow;
  checklist: Checklist | null;
  canClose: boolean;
  canReopen: boolean;
  isFuture: boolean;
}) {
  const t = useTranslations("periods");
  const format = useFormatter();
  const router = useRouter();
  const toast = useToast();
  const api = useApiForm();
  const [note, setNote] = useState("");
  const [reopening, setReopening] = useState(false);
  // The differences this page's own close found, shown until the refresh lands.
  const [justClosed, setJustClosed] = useState<PeriodClose | null>(null);

  const when = (iso: string | null | undefined) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" }) : "—";
  const closed = period.status === "closed";

  async function close() {
    const result = await api.run(() =>
      unwrap(
        browserApi.POST("/admin/accounting-periods/{month}/close", {
          params: { path: { month: period.month } },
          body: note.trim() ? { reason: note.trim() } : {},
        }),
      ),
    );
    if (!result) return;
    setJustClosed(result as unknown as PeriodClose);
    setNote("");
    toast(t("closedToast", { month: period.month }));
    router.refresh();
  }

  const closes = period.closes;
  const latest = justClosed ?? closes[0] ?? null;

  return (
    <div className="flex flex-col gap-5" data-testid="period-view" data-status={period.status}>
      <Link href="/finance/periods" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-dark">
        <ArrowRight className="size-4 ltr:-scale-x-100" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader
        title={t("monthTitle", { month: period.month })}
        actions={<Badge tone={closed ? "neutral" : "success"} data-testid="period-status">{t(`status.${period.status}`)}</Badge>}
      />
      {period.reopenedAt ? (
        <Alert tone="info" data-testid="period-reopened">
          {t("reopenedAt", { at: when(period.reopenedAt), reason: period.reopenReason ?? "" })}
        </Alert>
      ) : null}

      {!closed ? (
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-lg font-bold">{t("checklist.title")}</h2>
          {!canClose ? (
            <p className="text-sm text-text-muted" data-testid="checklist-hidden">{t("checklist.needsPermission")}</p>
          ) : !checklist ? (
            <Alert>{t("checklist.failed")}</Alert>
          ) : (
            <>
              <ul className="flex flex-col gap-2" data-testid="checklist">
                {checklist.checks.map((check) => {
                  const key = String(check.key);
                  const passed = Boolean(check.passed);
                  const advisory = Boolean(check.advisory);
                  const Icon = passed ? CheckCircle2 : advisory ? Info : CircleAlert;
                  return (
                    <li key={key} className="flex items-start gap-2 text-sm" data-testid="check" data-key={key} data-passed={passed}>
                      <Icon className={passed ? "size-5 text-success-dark" : advisory ? "size-5 text-info-dark" : "size-5 text-error-dark"} aria-hidden />
                      <span>
                        <span className="font-semibold">{t.has(`checks.${key}`) ? t(`checks.${key}`) : key}</span>
                        {" — "}
                        {t("checklist.count", { count: Number(check.count ?? 0) })}
                        {advisory ? <span className="text-text-muted"> · {t("checklist.advisory")}</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {isFuture ? <Alert tone="info">{t("future")}</Alert> : null}
              {checklist.can_close ? null : <Alert data-testid="checklist-blocked">{t("checklist.blocked")}</Alert>}
              <Field label={t("closeNote")} name="reason" hint={t("closeNoteHint")} error={api.fieldErrors.reason}>
                <Textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} data-testid="close-note" />
              </Field>
              <FormError kind={api.formError} detail={api.formErrorDetail} />
              <div className="flex justify-end">
                <Button onClick={() => void close()} pending={api.pending} disabled={!checklist.can_close} data-testid="period-close">
                  {t("close")}
                </Button>
              </div>
            </>
          )}
        </Card>
      ) : (
        <Card className="flex flex-col gap-3 p-5">
          <p className="text-sm">{t("closedBody", { at: when(period.closedAt) })}</p>
          {canReopen ? (
            <div>
              <Button variant="danger" onClick={() => setReopening(true)} data-testid="period-reopen">
                {t("reopen")}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-text-muted" data-testid="reopen-hidden">{t("reopenNeedsPermission")}</p>
          )}
        </Card>
      )}

      {latest && (latest.differences?.length ?? 0) > 0 ? (
        <Card className="p-5" data-testid="reclose-differences">
          <h2 className="mb-2 text-lg font-bold">{t("differences.title", { sequence: latest.sequence })}</h2>
          <Differences rows={latest.differences ?? []} />
        </Card>
      ) : null}

      <Card className="p-5">
        <h2 className="mb-3 text-lg font-bold">{t("history.title")}</h2>
        {closes.length === 0 ? (
          <p className="text-sm text-text-muted">{t("history.empty")}</p>
        ) : (
          <ol className="flex flex-col gap-4" data-testid="close-history">
            {closes.map((entry) => (
              <li key={entry.sequence} className="border-s-2 border-primary/40 ps-3" data-testid="close-entry">
                <p className="text-sm font-semibold">
                  {t("history.entry", { sequence: entry.sequence, at: when(entry.created_at) })}
                </p>
                {entry.reason ? <p className="text-sm text-text-muted">{entry.reason}</p> : null}
                {entry.sequence === 1 ? (
                  <p className="text-xs text-text-muted">{t("history.reference")}</p>
                ) : (entry.differences?.length ?? 0) === 0 ? (
                  <p className="text-xs text-text-muted">{t("differences.none")}</p>
                ) : (
                  <Differences rows={entry.differences ?? []} />
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>

      <ConfirmDialog
        open={reopening}
        title={t("reopenTitle", { month: period.month })}
        body={t("reopenBody")}
        confirmLabel={t("reopen")}
        onConfirm={async (reason) => {
          await unwrap(
            browserApi.POST("/admin/accounting-periods/{month}/reopen", {
              params: { path: { month: period.month } },
              body: { reason },
            }),
          );
          setJustClosed(null);
          toast(t("reopenedToast", { month: period.month }));
          router.refresh();
        }}
        onClose={() => setReopening(false)}
      />
    </div>
  );
}

function Differences({ rows }: { rows: Array<{ code: string; before: string; after: string }> }) {
  const t = useTranslations("periods");
  return (
    <table className="mt-1 w-full text-sm" data-testid="differences">
      <thead className="text-text-muted">
        <tr>
          <th className="py-1 text-start font-semibold">{t("differences.account")}</th>
          <th className="py-1 text-end font-semibold">{t("differences.before")}</th>
          <th className="py-1 text-end font-semibold">{t("differences.after")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.code} className="border-t border-border">
            <td className="py-1">
              <Link href={`/finance/ledger/entries?account_code=${encodeURIComponent(row.code)}`} className="text-primary-dark hover:underline" dir="ltr">
                {row.code}
              </Link>
            </td>
            <td className="py-1 text-end" dir="ltr">{row.before}</td>
            <td className="py-1 text-end" dir="ltr">{row.after}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
