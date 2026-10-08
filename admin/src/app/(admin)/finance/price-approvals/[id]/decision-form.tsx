"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Badge, Button, Card, Textarea } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError, errorKind, type ErrorKind } from "@/lib/api/errors";
import type { components } from "@/types/api";

type Approval = components["schemas"]["PricePublishApproval"];

interface Breach {
  sku?: string;
  price?: number;
  threshold_percent?: number;
  cost?: number;
  minimum_price?: number;
}

/** The person who proposed a change can't decide it (separation of duties). */
function isOwnRequest(error: unknown): boolean {
  return error instanceof ApiError && (error.code === "SEPARATION_OF_DUTIES_VIOLATION" || (error.status === 403 && /own|cannot approve|cannot decide/i.test(error.message)));
}

export function DecisionForm({ id, approval, canDecide, canViewCost }: { id: string; approval: Approval; canDecide: boolean; canViewCost: boolean }) {
  const t = useTranslations("priceApprovals");
  const locale = useLocale();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [decided, setDecided] = useState<Approval | null>(approval.status === "pending" ? null : approval);
  const [own, setOwn] = useState(false);
  const [problem, setProblem] = useState<ErrorKind | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const number = (value: number | undefined) =>
    value === undefined ? "—" : new Intl.NumberFormat(locale === "ar" ? "ar-IQ" : "en-US", { numberingSystem: "latn", maximumFractionDigits: 2 }).format(value);

  async function decide(decision: "approve" | "reject") {
    if (reason.trim().length < 3) {
      setProblem("validation");
      setDetail(t("reasonRequired"));
      return;
    }
    setBusy(decision);
    setProblem(null);
    setDetail(null);
    try {
      const result = await unwrap(
        browserApi.POST("/admin/price-publish-approvals/{id}/decision", {
          params: { path: { id } },
          body: { decision, reason: reason.trim() },
        }),
      );
      setDecided(result);
    } catch (cause) {
      if (isOwnRequest(cause)) setOwn(true);
      else {
        setProblem(errorKind(cause));
        setDetail(cause instanceof ApiError ? cause.message : null);
      }
    } finally {
      setBusy(null);
    }
  }

  if (decided) {
    const breaches = (decided.breaches ?? []) as Breach[];
    return (
      <Card className="flex flex-col gap-3 p-5" data-testid="price-approval-decided" data-status={decided.status}>
        <Badge tone={decided.status === "approved" ? "success" : "warning"}>{t(`status.${decided.status}`)}</Badge>
        <p className="text-sm">{decided.status === "approved" ? t("approvedBody") : t("rejectedBody")}</p>
        {breaches.length ? (
          <table className="w-full text-sm" data-testid="price-approval-breaches">
            <thead className="text-text-muted">
              <tr>
                <th className="px-2 py-1 text-start">{t("columns.sku")}</th>
                <th className="px-2 py-1 text-end">{t("columns.price")}</th>
                <th className="px-2 py-1 text-end">{t("columns.threshold")}</th>
                {canViewCost ? <th className="px-2 py-1 text-end">{t("columns.cost")}</th> : null}
              </tr>
            </thead>
            <tbody>
              {breaches.map((breach, index) => (
                <tr key={`${breach.sku}-${index}`} className="border-t border-border">
                  <td className="px-2 py-1" dir="ltr">{breach.sku ?? "—"}</td>
                  <td className="px-2 py-1 text-end" dir="ltr">{number(breach.price)}</td>
                  <td className="px-2 py-1 text-end" dir="ltr">{breach.threshold_percent === undefined ? "—" : `${number(breach.threshold_percent)}%`}</td>
                  {canViewCost ? <td className="px-2 py-1 text-end" dir="ltr">{number(breach.cost)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Card>
    );
  }

  const breaches = (approval.breaches ?? []) as Breach[];
  return (
    <Card className="flex max-w-3xl flex-col gap-4 p-5" data-testid="price-approval-form">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning">{t(`status.${approval.status}`)}</Badge>
        <span className="text-sm text-text-muted">{t(`kind.${approval.kind}`)}</span>
        <span className="text-sm text-text-muted">{t("proposedBy", { name: approval.proposer.name ?? approval.proposed_by })}</span>
      </div>
      <p className="text-sm text-text-muted">{t("body")}</p>
      {breaches.length ? (
        <table className="w-full text-sm" data-testid="price-approval-breaches">
          <thead className="text-text-muted">
            <tr>
              <th className="px-2 py-1 text-start">{t("columns.sku")}</th>
              <th className="px-2 py-1 text-end">{t("columns.price")}</th>
              <th className="px-2 py-1 text-end">{t("columns.threshold")}</th>
              {canViewCost ? <th className="px-2 py-1 text-end">{t("columns.cost")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {breaches.map((breach, index) => (
              <tr key={`${breach.sku}-${index}`} className="border-t border-border">
                <td className="px-2 py-1" dir="ltr">{breach.sku ?? "—"}</td>
                <td className="px-2 py-1 text-end" dir="ltr">{number(breach.price)}</td>
                <td className="px-2 py-1 text-end" dir="ltr">{breach.threshold_percent === undefined ? "—" : `${number(breach.threshold_percent)}%`}</td>
                {canViewCost ? <td className="px-2 py-1 text-end" dir="ltr">{number(breach.cost)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {!canDecide ? (
        <Alert tone="info" data-testid="price-approval-read-only">{t("readOnly")}</Alert>
      ) : own ? (
        <Alert data-testid="price-approval-own">{t("ownRequest")}</Alert>
      ) : (
        <>
          <Field label={t("reason")} name="reason">
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} data-testid="price-approval-reason" />
          </Field>
          {problem ? <FormError kind={problem} detail={detail} /> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => void decide("reject")} pending={busy === "reject"} disabled={busy !== null} data-testid="price-approval-reject">
              {t("reject")}
            </Button>
            <Button onClick={() => void decide("approve")} pending={busy === "approve"} disabled={busy !== null} data-testid="price-approval-approve">
              {t("approve")}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
