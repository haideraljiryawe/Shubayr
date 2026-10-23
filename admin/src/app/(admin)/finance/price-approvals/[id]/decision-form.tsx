"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Badge, Button, Card, Textarea } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError, errorCode, errorKind, type ErrorKind } from "@/lib/api/errors";
import type { components } from "@/types/api";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/table/table";

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
  return error instanceof ApiError && error.code === "SELF_APPROVAL_FORBIDDEN";
}

export function DecisionForm({ id, approval, canDecide, canViewCost }: { id: string; approval: Approval; canDecide: boolean; canViewCost: boolean }) {
  const t = useTranslations("priceApprovals");
  const locale = useLocale();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [decided, setDecided] = useState<Approval | null>(approval.status === "pending" ? null : approval);
  const [own, setOwn] = useState(false);
  const [problem, setProblem] = useState<ErrorKind | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [reasonMissing, setReasonMissing] = useState(false);
  const number = (value: number | undefined) =>
    value === undefined ? "—" : new Intl.NumberFormat(locale === "ar" ? "ar-IQ" : "en-US", { numberingSystem: "latn", maximumFractionDigits: 2 }).format(value);

  async function decide(decision: "approve" | "reject") {
    if (reason.trim().length < 3) {
      setReasonMissing(true);
      return;
    }
    setBusy(decision);
    setProblem(null);
    setCode(null);
    setReasonMissing(false);
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
        setCode(errorCode(cause) ?? null);
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
          <Table data-testid="price-approval-breaches">
            <THead>
              <Tr>
                <Th>{t("columns.sku")}</Th>
                <Th>{t("columns.price")}</Th>
                <Th>{t("columns.threshold")}</Th>
                {canViewCost ? <Th>{t("columns.cost")}</Th> : null}
              </Tr>
            </THead>
            <TBody>
              {breaches.map((breach, index) => (
                <Tr key={`${breach.sku}-${index}`}>
                  <Td dir="ltr">{breach.sku ?? "—"}</Td>
                  <Td dir="ltr">{number(breach.price)}</Td>
                  <Td dir="ltr">{breach.threshold_percent === undefined ? "—" : `${number(breach.threshold_percent)}%`}</Td>
                  {canViewCost ? <Td dir="ltr">{number(breach.cost)}</Td> : null}
                </Tr>
              ))}
            </TBody>
          </Table>
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
        <Table data-testid="price-approval-breaches">
          <THead>
            <Tr>
              <Th>{t("columns.sku")}</Th>
              <Th>{t("columns.price")}</Th>
              <Th>{t("columns.threshold")}</Th>
              {canViewCost ? <Th>{t("columns.cost")}</Th> : null}
            </Tr>
          </THead>
          <TBody>
            {breaches.map((breach, index) => (
              <Tr key={`${breach.sku}-${index}`}>
                <Td dir="ltr">{breach.sku ?? "—"}</Td>
                <Td dir="ltr">{number(breach.price)}</Td>
                <Td dir="ltr">{breach.threshold_percent === undefined ? "—" : `${number(breach.threshold_percent)}%`}</Td>
                {canViewCost ? <Td dir="ltr">{number(breach.cost)}</Td> : null}
              </Tr>
            ))}
          </TBody>
        </Table>
      ) : null}
      {!canDecide ? (
        <Alert tone="info" data-testid="price-approval-read-only">{t("readOnly")}</Alert>
      ) : own ? (
        <Alert data-testid="price-approval-own">{t("ownRequest")}</Alert>
      ) : (
        <>
          <Field label={t("reason")} name="reason" error={reasonMissing ? t("reasonRequired") : null}>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} data-testid="price-approval-reason" />
          </Field>
          {problem ? <FormError kind={problem} code={code} /> : null}
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
