"use client";

import { useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { usePosting, type PostingState } from "@/components/finance/use-posting";
import { PurchasingPostingStatus } from "@/components/purchasing/posting-status";
import { browserApi, unwrap } from "@/lib/api/client";
import { OperationKey } from "@/lib/finance/cash-receipts";
import { storeDay } from "@/lib/finance/dates";
import { moneyText, toFixed } from "@/lib/purchasing";
import {
  DELIVERY_FEE_EXCEPTION_PERMISSION,
  RETURN_CONDITIONS,
  approvalBody,
  inspectedLines,
  inspectionBody,
  locationsFor,
  quantityText,
  refundBody,
  returnRefusal,
  type ApprovalProblem,
  type InspectChoice,
  type InspectProblem,
  type RefundMethod,
  type RefundProblem,
  type Return,
  type ReturnCondition,
} from "@/lib/returns";
import type { CollectionChoice, LocationChoice } from "./return-view";

/* ---------------------------------------------------------------------------
 * The four staff steps. Each posts once per operation id: the id is tied to
 * what is being sent (OperationKey), so a double click or a retry after a
 * lost answer reuses it — the API replays its stored answer — while an edit
 * after a refusal gets a fresh one instead of a 409 for a changed payload.
 * usePosting drops a second click while one is in flight and, when the
 * answer is lost, asks GET /admin/operations/{id} before offering a retry.
 * ------------------------------------------------------------------------- */

type Posting = ReturnType<typeof usePosting<Return>>;

/** Post one step and report back; the form's own problems are checked first. */
function useStep() {
  const posting = usePosting<Return>();
  const key = useRef(new OperationKey());
  const [operationId, setOperationId] = useState<string | null>(null);
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";

  async function send(signature: unknown, call: (id: string, date: string) => Promise<Return>, onPosted: () => void) {
    const date = storeDay();
    const id = key.current.id(JSON.stringify({ signature, date }));
    setOperationId(id);
    const settled = await posting.post(id, () => call(id, date));
    if (settled?.phase === "posted") onPosted();
  }

  return { posting, operationId, busy, send };
}

/** The step's outcome: a declared refusal in its own words, else the shared posting states. */
function StepStatus({ posting, operationId, onRetry }: { posting: Posting; operationId: string | null; onRetry: () => void }) {
  const t = useTranslations("returns.refusals");
  if (!operationId) return null;
  const state: PostingState<Return> = posting.state;
  if (state.phase === "error") {
    const code = returnRefusal(state.error);
    if (code)
      return (
        <Alert data-testid="return-refusal" data-code={code}>
          {t(code)}
        </Alert>
      );
  }
  return <PurchasingPostingStatus state={state} onRetry={onRetry} onCheck={() => void posting.check(operationId)} />;
}

function Panel({ title, body, children, testId }: { title: string; body: ReactNode; children: ReactNode; testId: string }) {
  return (
    <Card className="flex flex-col gap-4 border-primary/40" data-testid={testId}>
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-1 text-sm text-text-muted">{body}</p>
      </div>
      {children}
    </Card>
  );
}

function itemName(item: Return["items"][number], locale: string) {
  return (locale === "ar" ? item.product_name_ar : item.product_name_en) || item.product_name_ar;
}

/* ---------------------------------------------------------------- approve */

export function ApprovePanel({
  ret,
  permissions,
  deliveryFee,
  onPosted,
}: {
  ret: Return;
  permissions: readonly string[];
  deliveryFee: number | null;
  onPosted: () => void;
}) {
  const t = useTranslations("returns.approve");
  const tq = useTranslations("returns.quantity");
  const locale = useLocale();
  const step = useStep();
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(ret.items.map((item) => [item.id, String(item.quantity)])));
  const [note, setNote] = useState("");
  const [feeOverride, setFeeOverride] = useState(false);
  const [feeAmount, setFeeAmount] = useState("");
  const [feeReason, setFeeReason] = useState("");
  const [problems, setProblems] = useState<ApprovalProblem[]>([]);
  const canOverrideFee = permissions.includes(DELIVERY_FEE_EXCEPTION_PERMISSION);
  const money = (value: number) => moneyText(toFixed(value), "IQD", 0, locale);
  const lineProblem = (id: string) => problems.find((problem) => problem.itemId === id)?.problem;
  const formProblem = (kind: string) => problems.some((problem) => problem.itemId === null && problem.problem === kind);

  async function submit() {
    const built = approvalBody(ret, { decision, quantities, note, feeOverride: canOverrideFee && feeOverride, feeAmount, feeReason });
    if (!built.ok) {
      setProblems(built.problems);
      return;
    }
    setProblems([]);
    await step.send(
      built.body,
      (id, date) =>
        unwrap(browserApi.POST("/returns/{id}/approve", { params: { path: { id: ret.id } }, body: { ...built.body, operation_id: id, document_date: date } })),
      onPosted,
    );
  }

  return (
    <Panel title={t("title")} body={t("body")} testId="return-approve-panel">
      <fieldset className="flex flex-wrap gap-4 text-sm" disabled={step.busy}>
        <legend className="sr-only">{t("decision")}</legend>
        {(["approve", "reject"] as const).map((value) => (
          <label key={value} className="flex items-center gap-2">
            <input type="radio" name="decision" value={value} checked={decision === value} onChange={() => setDecision(value)} data-testid={`return-decision-${value}`} />
            {t(`decisions.${value}`)}
          </label>
        ))}
      </fieldset>

      {decision === "approve" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">{t("product")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("requested")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("approvedQuantity")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("netPaid")}</th>
              </tr>
            </thead>
            <tbody>
              {ret.items.map((item) => {
                const problem = lineProblem(item.id);
                return (
                  <tr key={item.id} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      {itemName(item, locale)}
                      <span className="block text-xs text-text-muted">{item.customer_reason}</span>
                    </td>
                    <td className="px-3 py-2 text-end" dir="ltr">
                      {quantityText(item.quantity, item)}
                    </td>
                    <td className="px-3 py-2">
                      <Field
                        label={<span className="sr-only">{t("approvedQuantity")}</span>}
                        hint={item.whole_units_only ? tq("wholeHint") : tq("decimalHint", { unit: item.base_unit })}
                        error={problem ? tq(problem, { max: quantityText(item.quantity, item) }) : null}
                      >
                        <Input
                          inputMode={item.whole_units_only ? "numeric" : "decimal"}
                          dir="ltr"
                          className="w-32"
                          value={quantities[item.id] ?? ""}
                          disabled={step.busy}
                          onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))}
                          data-testid={`return-approve-qty-${item.id}`}
                        />
                      </Field>
                    </td>
                    <td className="px-3 py-2 text-end" dir="ltr">
                      {money(item.net_amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-text-muted">{t("zeroHint")}</p>
        </div>
      ) : null}

      <Field label={decision === "reject" ? t("rejectReason") : t("note")} error={formProblem("noteRequired") ? t("rejectReasonRequired") : null}>
        <Textarea rows={2} maxLength={500} value={note} disabled={step.busy} onChange={(event) => setNote(event.target.value)} data-testid="return-approve-note" />
      </Field>

      {decision === "approve" ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm" data-testid="return-fee-section">
          <p>{t("feePolicy")}</p>
          {deliveryFee !== null ? <p className="text-text-muted">{t("feeCharged", { fee: money(deliveryFee) })}</p> : null}
          {canOverrideFee ? (
            <>
              <label className="flex items-center gap-2 font-semibold">
                <input type="checkbox" checked={feeOverride} disabled={step.busy} onChange={(event) => setFeeOverride(event.target.checked)} data-testid="return-fee-override" />
                {t("feeOverride")}
              </label>
              {feeOverride ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label={t("feeAmount")} error={formProblem("feeInvalid") ? t("feeInvalid") : null}>
                    <Input inputMode="numeric" dir="ltr" value={feeAmount} disabled={step.busy} onChange={(event) => setFeeAmount(event.target.value)} data-testid="return-fee-amount" />
                  </Field>
                  <Field label={t("feeReason")} error={formProblem("feeReason") ? t("feeReasonRequired") : null}>
                    <Input value={feeReason} maxLength={500} disabled={step.busy} onChange={(event) => setFeeReason(event.target.value)} data-testid="return-fee-reason" />
                  </Field>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {formProblem("empty") ? <Alert data-testid="return-approve-empty">{t("empty")}</Alert> : null}
      <StepStatus posting={step.posting} operationId={step.operationId} onRetry={() => void submit()} />
      <div className="flex justify-end">
        <Button variant={decision === "reject" ? "danger" : "primary"} pending={step.busy} onClick={() => void submit()} data-testid="return-approve-submit">
          {decision === "reject" ? t("submitReject") : t("submitApprove")}
        </Button>
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- receive */

export function ReceivePanel({ ret, onPosted }: { ret: Return; onPosted: () => void }) {
  const t = useTranslations("returns.receive");
  const locale = useLocale();
  const step = useStep();
  const [note, setNote] = useState("");

  async function submit() {
    const body = note.trim() ? { note: note.trim() } : {};
    await step.send(
      body,
      (id, date) => unwrap(browserApi.POST("/returns/{id}/receive", { params: { path: { id: ret.id } }, body: { ...body, operation_id: id, document_date: date } })),
      onPosted,
    );
  }

  return (
    <Panel title={t("title")} body={t("body")} testId="return-receive-panel">
      <ul className="flex flex-col gap-1 text-sm">
        {inspectedLines(ret).map((item) => (
          <li key={item.id} className="flex justify-between gap-3">
            <span>{itemName(item, locale)}</span>
            <span dir="ltr" className="font-semibold">
              {quantityText(item.approved_quantity, item)}
            </span>
          </li>
        ))}
      </ul>
      <Field label={t("note")}>
        <Textarea rows={2} maxLength={500} value={note} disabled={step.busy} onChange={(event) => setNote(event.target.value)} data-testid="return-receive-note" />
      </Field>
      <StepStatus posting={step.posting} operationId={step.operationId} onRetry={() => void submit()} />
      <div className="flex justify-end">
        <Button pending={step.busy} onClick={() => void submit()} data-testid="return-receive-submit">
          {t("submit")}
        </Button>
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- inspect */

export function InspectPanel({ ret, locations, onPosted }: { ret: Return; locations: LocationChoice[]; onPosted: () => void }) {
  const t = useTranslations("returns.inspect");
  const tc = useTranslations("returns.conditions");
  const locale = useLocale();
  const step = useStep();
  const lines = inspectedLines(ret);
  const [choices, setChoices] = useState<Record<string, InspectChoice>>({});
  const [note, setNote] = useState("");
  const [problems, setProblems] = useState<InspectProblem[]>([]);

  function choose(itemId: string, patch: Partial<InspectChoice>) {
    setChoices((current) => {
      const next: InspectChoice = { ...(current[itemId] ?? { condition: "", locationId: "" }), ...patch };
      // A new condition may rule the chosen location out: pick again.
      if (patch.condition !== undefined && !locationsFor(patch.condition, locations).some((location) => location.id === next.locationId)) next.locationId = "";
      return { ...current, [itemId]: next };
    });
  }

  async function submit() {
    const built = inspectionBody(ret, choices, locations);
    if (!built.ok) {
      setProblems(built.problems);
      return;
    }
    setProblems([]);
    const body = { ...built.body, ...(note.trim() ? { note: note.trim() } : {}) };
    await step.send(
      body,
      (id, date) => unwrap(browserApi.POST("/returns/{id}/inspect", { params: { path: { id: ret.id } }, body: { ...body, operation_id: id, document_date: date } })),
      onPosted,
    );
  }

  return (
    <Panel title={t("title")} body={t("body")} testId="return-inspect-panel">
      {!locations.length ? <Alert data-testid="return-inspect-no-locations">{t("noLocations")}</Alert> : null}
      <div className="flex flex-col gap-4">
        {lines.map((item) => {
          const choice = choices[item.id] ?? { condition: "", locationId: "" };
          const fits = locationsFor(choice.condition, locations);
          const problem = problems.find((entry) => entry.itemId === item.id)?.problem;
          return (
            <div key={item.id} className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[2fr_1fr_1fr]" data-testid={`return-inspect-line-${item.id}`}>
              <div className="text-sm">
                <p className="font-semibold">{itemName(item, locale)}</p>
                <p className="text-text-muted" dir="ltr">
                  {quantityText(item.approved_quantity, item)}
                </p>
              </div>
              <Field label={t("condition")} error={problem === "condition" ? t("conditionRequired") : null}>
                <Select
                  value={choice.condition}
                  disabled={step.busy}
                  onChange={(event) => choose(item.id, { condition: event.target.value as ReturnCondition | "" })}
                  data-testid={`return-inspect-condition-${item.id}`}
                >
                  <option value="">{t("chooseCondition")}</option>
                  {RETURN_CONDITIONS.map((condition) => (
                    <option key={condition} value={condition}>
                      {tc(condition)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t("location")}
                hint={choice.condition ? (choice.condition === "sellable" ? t("sellableHint") : t("nonSellableHint")) : null}
                error={problem === "location" ? t("locationRequired") : problem === "mismatch" ? t("locationMismatch") : null}
              >
                <Select
                  value={choice.locationId}
                  disabled={step.busy || !choice.condition}
                  onChange={(event) => choose(item.id, { locationId: event.target.value })}
                  data-testid={`return-inspect-location-${item.id}`}
                >
                  <option value="">{choice.condition && !fits.length ? t("noFittingLocation") : t("chooseLocation")}</option>
                  {fits.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.warehouse} · {location.code}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-text-muted" data-testid="return-inspect-cost">
        {t("costRule")}
      </p>
      <Field label={t("note")}>
        <Textarea rows={2} maxLength={500} value={note} disabled={step.busy} onChange={(event) => setNote(event.target.value)} data-testid="return-inspect-note" />
      </Field>
      <StepStatus posting={step.posting} operationId={step.operationId} onRetry={() => void submit()} />
      <div className="flex justify-end">
        <Button pending={step.busy} onClick={() => void submit()} data-testid="return-inspect-submit">
          {t("submit")}
        </Button>
      </div>
    </Panel>
  );
}

/* ----------------------------------------------------------------- refund */

export function RefundPanel({
  ret,
  cashAccounts,
  collection,
  onPosted,
}: {
  ret: Return;
  cashAccounts: Array<{ id: string; name: string }> | null;
  collection: CollectionChoice | null;
  onPosted: () => void;
}) {
  const t = useTranslations("returns.refund");
  const locale = useLocale();
  const step = useStep();
  const money = (value: number) => moneyText(toFixed(value), "IQD", 0, locale);
  const nothingToPay = ret.cash_refund_amount <= 0;
  const [method, setMethod] = useState<RefundMethod>(cashAccounts === null && collection ? "delivery_custody" : "cash_account");
  const [cashAccountId, setCashAccountId] = useState(cashAccounts?.length === 1 ? cashAccounts[0].id : "");
  const [proofReference, setProofReference] = useState("");
  const [problems, setProblems] = useState<RefundProblem[]>([]);

  async function submit() {
    const built = refundBody(ret, { method, cashAccountId, collectionId: collection?.id ?? "", proofReference });
    if (!built.ok) {
      setProblems(built.problems);
      return;
    }
    setProblems([]);
    await step.send(
      built.body,
      (id, date) => unwrap(browserApi.POST("/returns/{id}/refund", { params: { path: { id: ret.id } }, body: { ...built.body, operation_id: id, document_date: date } })),
      onPosted,
    );
  }

  return (
    <Panel title={t("title")} body={t("body")} testId="return-refund-panel">
      <div className="flex flex-col gap-1 text-sm">
        <p>
          {t("toPay")}{" "}
          <span dir="ltr" className="text-base font-bold" data-testid="return-refund-to-pay">
            {money(ret.cash_refund_amount)}
          </span>
        </p>
        {ret.uncollected_offset > 0 ? <p className="text-text-muted">{t("offsetNote", { offset: money(ret.uncollected_offset) })}</p> : null}
        <p className="text-text-muted">{t("pointsNote")}</p>
      </div>

      {nothingToPay ? (
        <Alert tone="info" data-testid="return-refund-nothing">
          {t("nothingToPay")}
        </Alert>
      ) : (
        <>
          <fieldset className="flex flex-col gap-2 text-sm" disabled={step.busy}>
            <legend className="mb-1 font-semibold">{t("method")}</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="method" checked={method === "cash_account"} onChange={() => setMethod("cash_account")} data-testid="return-refund-method-cash" />
              {t("methods.cash_account")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="method"
                checked={method === "delivery_custody"}
                disabled={!collection}
                onChange={() => setMethod("delivery_custody")}
                data-testid="return-refund-method-custody"
              />
              {t("methods.delivery_custody")}
              {!collection ? <span className="text-xs text-text-muted">{t("custodyUnavailable")}</span> : null}
            </label>
          </fieldset>

          {method === "cash_account" ? (
            cashAccounts === null ? (
              <Alert data-testid="return-refund-no-accounts">{t("cashAccountsForbidden")}</Alert>
            ) : (
              <Field label={t("cashAccount")} error={problems.includes("cashAccount") ? t("cashAccountRequired") : null}>
                <Select value={cashAccountId} disabled={step.busy} onChange={(event) => setCashAccountId(event.target.value)} data-testid="return-refund-cash-account">
                  <option value="">{cashAccounts.length ? t("chooseCashAccount") : t("noCashAccounts")}</option>
                  {cashAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )
          ) : collection ? (
            <div className="grid gap-3 md:grid-cols-2">
              <p className="text-sm" data-testid="return-refund-collection">
                {t("collection", { collected: collection.collected === null ? "—" : money(collection.collected), status: t(`collectionStatuses.${collection.status}`) })}
              </p>
              <Field label={t("proof")} hint={t("proofHint")} error={problems.includes("proof") ? t("proofRequired") : null}>
                <Input value={proofReference} maxLength={160} disabled={step.busy} onChange={(event) => setProofReference(event.target.value)} data-testid="return-refund-proof" />
              </Field>
            </div>
          ) : null}
        </>
      )}

      <StepStatus posting={step.posting} operationId={step.operationId} onRetry={() => void submit()} />
      <div className="flex justify-end">
        <Button pending={step.busy} onClick={() => void submit()} data-testid="return-refund-submit">
          {nothingToPay ? t("submitNothing") : t("submit")}
        </Button>
      </div>
    </Panel>
  );
}
