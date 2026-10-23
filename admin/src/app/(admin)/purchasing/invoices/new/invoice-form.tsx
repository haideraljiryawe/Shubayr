"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Field } from "@/components/forms/field";
import { usePosting } from "@/components/finance/use-posting";
import { SkuPicker, type PickedSku } from "@/components/inventory/sku-picker";
import { DocumentDateFields, documentDateError, type DocumentDateValue } from "@/components/purchasing/document-date";
import { PurchasingPostingStatus } from "@/components/purchasing/posting-status";
import { useCentralRate } from "@/components/purchasing/use-central-rate";
import { SupplierDialog } from "@/components/purchasing/supplier-dialog";
import { SupplierPicker } from "@/components/purchasing/supplier-picker";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { linesToPost, paidNowAmount, startingCost, type LastCost } from "@/lib/restock";
import type { CashAccountOption } from "@/lib/api/purchasing-server";
import { RestockResult } from "./restock-result";
import { newOperationId } from "@/lib/finance/operations";
import { locationLabel, type LocationInfo } from "@/lib/inventory";
import {
  allocateLanded,
  baseQuantityError,
  displayShares,
  fixedText,
  fx,
  isSeparationOfDuties,
  landedUnitCostIqd,
  moneyText,
  packConversion,
  precisionOf,
  toFixed,
  type AllocationMethod,
  type CurrencyCode,
  type PurchaseInvoice,
  type Supplier,
} from "@/lib/purchasing";

/* ---------------------------------------------------------------- state */

interface Line {
  key: number;
  sku: PickedSku | null;
  packs: string;
  packSize: string;
  cost: string;
  locationId: string;
  lot: string;
  expiry: string;
  manual: string;
  /** Restock: what was last paid for this SKU (shown; used when the currency matches). */
  lastCost?: LastCost | null;
}

interface Landed {
  key: number;
  kind: string;
  description: string;
  currency: CurrencyCode;
  amount: string;
}

interface FormState {
  nextKey: number;
  supplierId: string;
  invoiceNumber: string;
  date: DocumentDateValue;
  currency: CurrencyCode;
  /** Rate typed by someone allowed to override the central rate ("" = central). */
  rate: string;
  defaultLocationId: string;
  dueDate: string;
  notes: string;
  method: AllocationMethod;
  lines: Line[];
  landed: Landed[];
  /** Owed (paid later from Supplier payments) or paid now from a cash account. */
  payment: "owed" | "now";
  cashAccountId: string;
}

/** Restock from one product: a line per variant and the starting choices. */
export interface RestockPrefill {
  productId: string;
  productName: string;
  supplierId: string;
  locationId: string;
  lines: Array<{ sku: PickedSku; lastCost: LastCost | null }>;
}

/** POST /admin/purchase-invoices/paid-now: the posted invoice and its payment, together. */
interface PaidNowResult {
  invoice: PurchaseInvoice;
  payment: { id: string; document_number: string };
}

/** The posted invoice, whether the answer was an invoice or a paid-now result. */
function postedInvoiceOf(document: PurchaseInvoice | PaidNowResult): PurchaseInvoice {
  return "invoice" in document && typeof document.invoice === "object" ? document.invoice : (document as PurchaseInvoice);
}

const DRAFT_TYPE = "purchase_invoice";
const DRAFT_VERSION = 1;

function blankLine(key: number): Line {
  return { key, sku: null, packs: "", packSize: "1", cost: "", locationId: "", lot: "", expiry: "", manual: "" };
}

function initialState(supplier: Supplier | undefined, today: string, defaultLocationId: string, restock?: RestockPrefill | null): FormState {
  const currency = supplier?.default_currency ?? "IQD";
  const lines = restock?.lines.length
    ? restock.lines.map((line, index) => ({ ...blankLine(index + 1), sku: line.sku, cost: startingCost(line.lastCost, currency), lastCost: line.lastCost }))
    : [blankLine(1)];
  return {
    nextKey: lines.length + 1,
    supplierId: supplier?.id ?? "",
    invoiceNumber: "",
    date: { date: today, backdateReason: "" },
    currency,
    rate: "",
    defaultLocationId: restock?.locationId || defaultLocationId,
    dueDate: "",
    notes: "",
    method: "value",
    lines,
    landed: [],
    payment: "owed",
    cashAccountId: "",
  };
}

type Saved = { status: "idle" } | { status: "saving" } | { status: "saved"; at: string } | { status: "failed" };

/* ----------------------------------------------------------------- form */

export function InvoiceForm({
  suppliers,
  locations,
  presetSupplierId,
  today,
  windowDays,
  permissions,
  restock = null,
  cashAccounts = null,
}: {
  /** The picker's first view: suppliers in recent-purchase order (the API's sort). */
  suppliers: Supplier[];
  locations: LocationInfo[];
  presetSupplierId: string;
  today: string;
  windowDays: number;
  permissions: string[];
  /** Restock (إعادة تعبئة المخزون): prefilled from one product; drafts are left alone. */
  restock?: RestockPrefill | null;
  /** Cash accounts for "paid now"; null when the person can't pay suppliers here. */
  cashAccounts?: CashAccountOption[] | null;
}) {
  const t = useTranslations("purchasing.invoice");
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const posting = usePosting<PurchaseInvoice | PaidNowResult>();
  const can = (key: string) => permissions.includes(key);
  const canCost = can("cost.view");
  const [supplierList, setSupplierList] = useState<Supplier[]>(suppliers);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [postedInvoice, setPostedInvoice] = useState<PurchaseInvoice | null>(null);
  /** The caller's own draft, removed by the posting (draft_id) — never another one. */
  const [draftId, setDraftId] = useState<string | null>(null);
  /** Restock: when the person also has an unfinished invoice draft (posting leaves it alone). */
  const [otherDraftAt, setOtherDraftAt] = useState<string | null>(null);
  const [initial] = useState<FormState>(() =>
    initialState(
      suppliers.find((supplier) => supplier.id === (presetSupplierId || restock?.supplierId)),
      today,
      locations.find((info) => info.sellable)?.id ?? locations[0]?.id ?? "",
      restock,
    ),
  );
  const [state, setState] = useState<FormState>(initial);
  /** Bumped when a draft is restored or discarded, so uncontrolled inputs remount. */
  const [generation, setGeneration] = useState(0);
  const [draftReady, setDraftReady] = useState(false);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved>({ status: "idle" });
  const [showErrors, setShowErrors] = useState(false);
  const [review, setReview] = useState<{ operationId: string } | null>(null);
  const posted = posting.state.phase === "posted";
  const busy = posting.state.phase === "posting" || posting.state.phase === "checking";
  /** What the server holds (the restored, initial or last saved form), as JSON. */
  const baseline = useRef<string | null>(null);

  const set = (patch: Partial<FormState>) => setState((current) => ({ ...current, ...patch }));
  const setLine = (key: number, patch: Partial<Line>) =>
    setState((current) => ({ ...current, lines: current.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)) }));
  const setLanded = (key: number, patch: Partial<Landed>) =>
    setState((current) => ({ ...current, landed: current.landed.map((cost) => (cost.key === key ? { ...cost, ...patch } : cost)) }));

  /* ------------------------------------------------------------ drafts */

  // Restore the caller's own draft once (drafts are per user on the server).
  // A restock never restores, saves or removes one: it only says that one
  // exists. Posting removes only the draft it names (draft_id).
  useEffect(() => {
    let cancelled = false;
    unwrap(browserApi.GET("/admin/drafts/{documentType}", { params: { path: { documentType: DRAFT_TYPE } } })).then(
      (draft) => {
        if (cancelled) return;
        if (restock) {
          setOtherDraftAt(draft.updated_at);
          return;
        }
        setDraftId(draft.id);
        const payload = draft.payload as { version?: number; state?: FormState };
        if (payload.version === DRAFT_VERSION && payload.state) {
          baseline.current = JSON.stringify(payload.state);
          setState(payload.state);
          setRestoredAt(draft.updated_at);
          setGeneration((value) => value + 1);
        }
        setDraftReady(true);
      },
      () => {
        // No draft: anything typed so far (even before this answer) is new.
        if (!cancelled) setDraftReady(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [restock]);

  // Save as it is typed (debounced), once the stored draft has been read —
  // whenever the form differs from what the server last held.
  useEffect(() => {
    if (!draftReady || posted || restock) return;
    const snapshot = JSON.stringify(state);
    // Untouched since it opened: nothing to save.
    if (baseline.current === null) baseline.current = JSON.stringify(initial);
    if (snapshot === baseline.current) return;
    const timer = window.setTimeout(() => {
      setSaved({ status: "saving" });
      unwrap(
        browserApi.PUT("/admin/drafts/{documentType}", {
          params: { path: { documentType: DRAFT_TYPE } },
          body: { payload: { version: DRAFT_VERSION, state } as unknown as Record<string, unknown> },
        }),
      ).then(
        (draft) => {
          baseline.current = snapshot;
          setDraftId(draft.id);
          setSaved({ status: "saved", at: draft.updated_at });
        },
        () => setSaved({ status: "failed" }),
      );
    }, 800);
    return () => window.clearTimeout(timer);
  }, [state, draftReady, posted, initial, restock]);

  async function discardDraft() {
    try {
      await unwrap(browserApi.DELETE("/admin/drafts/{documentType}", { params: { path: { documentType: DRAFT_TYPE } } }));
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.status === 404)) return;
    }
    const fresh = initialState(undefined, today, locations.find((info) => info.sellable)?.id ?? locations[0]?.id ?? "");
    setDraftId(null);
    baseline.current = JSON.stringify(fresh);
    setState(fresh);
    setRestoredAt(null);
    setSaved({ status: "idle" });
    setReview(null);
    setShowErrors(false);
    setGeneration((value) => value + 1);
  }

  /* ------------------------------------------------------------- rates */

  const central = useCentralRate(state.currency, state.date.date, can("fx_rates.view"));
  const usdCentral = useCentralRate("USD", state.date.date, can("fx_rates.view"));
  const canOverride = can("purchases.override_rate");
  const overridden = canOverride && state.currency !== "IQD" && state.rate.trim() !== "";
  const rate: string | null =
    state.currency === "IQD" ? "1" : overridden ? state.rate : central.status === "ready" ? central.rate : null;

  /** IQD rate for a landed cost, or null when it can't be known here. */
  function landedRate(currency: CurrencyCode): string | null {
    if (currency === "IQD") return "1";
    if (currency === state.currency) return rate;
    return usdCentral.status === "ready" ? usdCentral.rate : null;
  }

  /* ------------------------------------------------------------ preview */

  // Lines left empty (or at 0) are not part of the invoice: restocking one
  // colour of a product is one quantity, the other lines just stay blank.
  const { posted: postedLines, skipped } = useMemo(() => linesToPost(state.lines, (line) => line.packs), [state.lines]);

  const preview = useMemo(() => {
    const lines = postedLines.map((line) => {
      const conversion = packConversion(line.packs || "0", line.packSize || "1", line.cost || "0");
      return { line, ...conversion, unitError: line.sku ? baseQuantityError(conversion.baseQuantity, line.sku.wholeUnitsOnly) : null };
    });
    const subtotal = lines.reduce((sum, row) => sum + row.lineTotal, 0n);
    let landedIqd: bigint | null = 0n;
    for (const cost of state.landed) {
      const costRate = landedRate(cost.currency);
      if (costRate === null) {
        landedIqd = null;
        break;
      }
      landedIqd += fx.mul(toFixed(cost.amount || "0"), toFixed(costRate));
    }
    const allocation =
      landedIqd === null
        ? null
        : allocateLanded(
            lines.map((row) => ({ value: row.lineTotal, quantity: row.baseQuantity, manual: toFixed(row.line.manual || "0") })),
            landedIqd,
            state.method,
          );
    const shown = allocation ? displayShares(allocation.shares, 0) : null;
    const rateFixed = rate ? toFixed(rate) : null;
    const totalIqd = rateFixed !== null && landedIqd !== null ? fx.mul(subtotal, rateFixed) + landedIqd : null;
    return { lines, subtotal, landedIqd, allocation, shown, rateFixed, totalIqd };
    // landedRate reads state/rates already listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, postedLines, rate, usdCentral]);

  /** A preview of what "paid now" pays (the server computes the exact amount), or null when only the server can. */
  const paidAmount = useMemo(
    () => paidNowAmount(preview.lines.map((row) => row.lineTotal), state.landed, state.currency),
    [preview.lines, state.landed, state.currency],
  );

  /* --------------------------------------------------------- validation */

  const problems = useMemo(() => {
    const found: Record<string, string> = {};
    if (!state.supplierId) found.supplier = t("errors.supplier");
    if (documentDateError(state.date, today, windowDays, can("backdate.approve"))) found.date = "date";
    if (state.currency !== "IQD") {
      if (overridden && toFixed(state.rate) <= 0n) found.rate = t("errors.rate");
      if (!overridden && central.status === "missing") found.rate = t("errors.noCentralRate");
    }
    if (!state.defaultLocationId) found.location = t("errors.location");
    if (postedLines.length === 0) found.lines = state.lines.length ? t("errors.noQuantities") : t("errors.noLines");
    if (state.payment === "now" && !state.cashAccountId) found.cashAccount = t("payNow.errors.account");
    for (const row of preview.lines) {
      const k = `line-${row.line.key}`;
      if (!row.line.sku) found[`${k}-sku`] = t("errors.sku");
      if (toFixed(row.line.packs || "0") < 0n) found[`${k}-packs`] = t("errors.packs");
      if (toFixed(row.line.packSize || "0") <= 0n) found[`${k}-packSize`] = t("errors.packSize");
      if (row.unitError) found[`${k}-packs`] = t(`errors.${row.unitError}`);
      if (toFixed(row.line.cost || "0") <= 0n) found[`${k}-cost`] = t("errors.cost");
    }
    for (const cost of state.landed) {
      if (cost.kind.trim().length < 2) found[`landed-${cost.key}-kind`] = t("errors.kind");
      if (toFixed(cost.amount || "0") <= 0n) found[`landed-${cost.key}-amount`] = t("errors.amount");
    }
    if (preview.allocation?.error) found.allocation = t(`errors.${preview.allocation.error}`);
    if (state.landed.length && preview.landedIqd === null && state.method === "manual") found.allocation = t("errors.manualNeedsRate");
    return found;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, postedLines, preview, central, overridden, today, windowDays]);

  function toReview() {
    setShowErrors(true);
    if (Object.keys(problems).length) return;
    posting.reset();
    // The document's identity is fixed here: a double click or a retry posts it once.
    setReview({ operationId: newOperationId() });
  }

  /** The invoice as both posting routes take it (the plain one adds operation_id). */
  function invoiceBody() {
    return {
      document_date: state.date.date,
      ...(state.date.backdateReason.trim() ? { backdate_reason: state.date.backdateReason.trim() } : {}),
      // Posting removes this person's own draft only when it is this one.
      ...(!restock && draftId ? { draft_id: draftId } : {}),
      supplier_id: state.supplierId,
      ...(state.invoiceNumber.trim() ? { supplier_invoice_number: state.invoiceNumber.trim() } : {}),
      currency_code: state.currency,
      ...(overridden ? { exchange_rate: state.rate.trim() } : {}),
      default_location_id: state.defaultLocationId,
      allocation_method: state.method,
      ...(state.dueDate ? { due_date: state.dueDate } : {}),
      ...(state.notes.trim() ? { notes: state.notes.trim() } : {}),
      lines: postedLines.map((line) => ({
        variant_id: line.sku!.variantId,
        ...(line.locationId ? { location_id: line.locationId } : {}),
        quantity: line.packs,
        pack_size: line.packSize || "1",
        unit_cost: line.cost,
        ...(line.lot.trim() ? { lot_number: line.lot.trim() } : {}),
        ...(line.expiry ? { expiry_date: line.expiry } : {}),
        ...(state.method === "manual" ? { manual_landed_cost_iqd: line.manual || "0" } : {}),
      })),
      ...(state.landed.length
        ? {
            landed_costs: state.landed.map((cost) => ({
              kind: cost.kind.trim(),
              ...(cost.description.trim() ? { description: cost.description.trim() } : {}),
              currency_code: cost.currency,
              amount: cost.amount,
            })),
          }
        : {}),
    };
  }

  async function confirm() {
    if (!review) return;
    const account = (cashAccounts ?? []).find((row) => row.id === state.cashAccountId);
    const payNow = state.payment === "now" && account;
    const result = await posting.post(review.operationId, async () => {
      if (payNow) {
        // One atomic call: invoice, stock, payment and allocation commit
        // together or not at all; the review's id is the Idempotency-Key, so
        // a retry (or a lost answer, checked by that id) pays exactly once.
        return (await unwrap(
          browserApi.POST("/admin/purchase-invoices/paid-now", {
            params: { header: { "Idempotency-Key": review.operationId } },
            body: {
              invoice: invoiceBody(),
              // The server computes the exact full settlement — landed costs and
              // currency conversion included — so nothing is left owed (17.9.0).
              payment: { cash_account_id: account.id, currency_code: account.currency_code, pay_full_invoice_total: true },
            },
          }),
        )) as unknown as PaidNowResult;
      }
      return (await unwrap(
        browserApi.POST("/admin/purchase-invoices", { body: { operation_id: review.operationId, ...invoiceBody() } }),
      )) as unknown as PurchaseInvoice;
    });
    if (result?.phase !== "posted") return;
    // Posted: the named draft is gone on the server; the invoice is read-only now.
    const invoice = postedInvoiceOf(result.document);
    setPostedInvoice(invoice);
    if (!restock && !payNow) router.push(`/purchasing/invoices/${invoice.id}`);
  }

  /** Choosing a supplier sets the invoice currency to theirs (and re-reads the costs). */
  function chooseSupplier(next: Supplier | undefined, id: string) {
    setState((current) => {
      const currency = next?.default_currency ?? current.currency;
      return {
        ...current,
        supplierId: id,
        ...(next ? { currency, rate: "" } : {}),
        // A restock line still at its starting cost follows the new currency.
        lines: current.lines.map((line) =>
          line.lastCost !== undefined && (line.cost === "" || line.cost === startingCost(line.lastCost ?? null, current.currency))
            ? { ...line, cost: startingCost(line.lastCost ?? null, currency) }
            : line,
        ),
        cashAccountId: "",
      };
    });
  }

  /* ------------------------------------------------------------- render */

  const supplier = supplierList.find((row) => row.id === state.supplierId);
  // The server converts between currencies for "paid now", so any active account can pay.
  const payable = (cashAccounts ?? []).filter((account) => account.is_active);
  const payingAccount = payable.find((row) => row.id === state.cashAccountId);
  const precision = precisionOf(state.currency);
  const money = (value: bigint | null, currency: string) =>
    value === null ? t("atPosting") : moneyText(value, currency, precisionOf(currency), locale);
  const err = (key: string) => (showErrors ? problems[key] ?? null : null);
  const locked = review !== null;

  return (
    <div className="flex flex-col gap-6" data-testid="invoice-form" data-mode={restock ? "restock" : "invoice"}>
      {restock ? (
        <>
          <Alert tone="info" data-testid="restock-intro">
            {t("restock.intro", { name: restock.productName })}
          </Alert>
          {otherDraftAt ? (
            <Alert data-testid="restock-other-draft">
              {t("restock.otherDraft", { at: format.dateTime(new Date(otherDraftAt), { timeStyle: "short", dateStyle: "short", numberingSystem: "latn" }) })}{" "}
              <Link className="font-semibold underline" href="/purchasing/invoices/new">
                {t("restock.openDraft")}
              </Link>
            </Alert>
          ) : null}
        </>
      ) : (
        <DraftBar
          restoredAt={restoredAt}
          saved={saved}
          onDiscard={() => void discardDraft()}
          when={(iso) => format.dateTime(new Date(iso), { timeStyle: "short", dateStyle: "short", numberingSystem: "latn" })}
        />
      )}
      {restock && posted && postedInvoice ? <RestockResult invoice={postedInvoice} restock={restock} /> : null}

      {/* ------------------------------------------------------- header */}
      <Card className="grid gap-4 md:grid-cols-3">
        <Field label={t("supplier")} name="supplier_id" error={err("supplier")}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <SupplierPicker
                value={supplier ?? null}
                recent={suppliers}
                disabled={locked}
                onChange={(picked) => {
                  if (picked && !supplierList.some((row) => row.id === picked.id)) setSupplierList((current) => [...current, picked]);
                  chooseSupplier(picked ?? undefined, picked?.id ?? "");
                }}
              />
            </div>
            {can("suppliers.manage") && !locked ? (
              <Button variant="secondary" onClick={() => setCreatingSupplier(true)} aria-label={t("newSupplier")} title={t("newSupplier")} data-testid="invoice-new-supplier">
                <UserPlus className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        </Field>
        <Field label={t("invoiceNumber")} name="supplier_invoice_number" hint={t("invoiceNumberHint")}>
          <Input value={state.invoiceNumber} maxLength={80} dir="ltr" disabled={locked} onChange={(event) => set({ invoiceNumber: event.target.value })} data-testid="invoice-number" />
        </Field>
        <DocumentDateFields
          value={state.date}
          onChange={(date) => set({ date })}
          today={today}
          windowDays={windowDays}
          canBackdate={can("backdate.approve")}
          showErrors={showErrors}
          disabled={locked}
          testId="invoice"
        />
        <Field label={t("currency")} name="currency_code" hint={supplier ? t("supplierCurrency", { currency: supplier.default_currency }) : undefined}>
          <Select value={state.currency} disabled={locked} onValueChange={(value) => set({ currency: value as CurrencyCode, rate: "" })} data-testid="invoice-currency">
            <option value="IQD">IQD</option>
            <option value="USD">USD</option>
          </Select>
        </Field>
        {state.currency !== "IQD" ? (
          <Field
            // Not keyed by the rate's loading state: a late-arriving default
            // must not remount the field over a rate the user typed.
            key={`rate-${generation}-${state.currency}`}
            label={t("rate", { currency: state.currency })}
            name="exchange_rate"
            error={err("rate")}
            hint={
              central.status === "ready"
                ? canOverride
                  ? t("rateCentralEditable", { rate: central.rate })
                  : t("rateCentral", { rate: central.rate })
                : central.status === "hidden"
                  ? t("rateHidden")
                  : central.status === "missing"
                    ? t("rateMissing")
                    : undefined
            }
          >
            <DecimalInput
              value={overridden ? state.rate : ""}
              prefill={central.status === "ready" ? central.rate : ""}
              parse={{ maxDecimals: 10 }}
              disabled={!canOverride || locked}
              onValueChange={(value, text) => set({ rate: value === null ? text : value })}
              data-testid="invoice-rate"
            />
          </Field>
        ) : null}
        <Field label={t("defaultLocation")} name="default_location_id" error={err("location")}>
          <Select value={state.defaultLocationId} disabled={locked} onValueChange={(value) => set({ defaultLocationId: value })} data-testid="invoice-location">
            {locations.map((info) => (
              <option key={info.id} value={info.id}>
                {locationLabel(info)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("dueDate")} name="due_date" hint={supplier ? t("dueDateHint", { days: supplier.payment_terms_days }) : undefined}>
          <Input type="date" value={state.dueDate} disabled={locked} onChange={(event) => set({ dueDate: event.target.value })} />
        </Field>
      </Card>

      {/* -------------------------------------------------------- lines */}
      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">{t("lines")}</h2>
        {err("lines") ? <Alert>{err("lines")}</Alert> : null}
        {state.lines.map((line, index) => {
          // A line without a quantity stays where it is, but isn't part of the
          // invoice, its totals or its checks.
          const at = postedLines.indexOf(line);
          const blank = at < 0;
          const row = blank ? { line, ...packConversion("0", line.packSize || "1", line.cost || "0"), unitError: null } : preview.lines[at];
          const k = `line-${row.line.key}`;
          const share = blank ? null : (preview.shown?.[at] ?? null);
          const exactShare = blank ? null : (preview.allocation?.shares[at] ?? null);
          const landedUnit =
            preview.rateFixed !== null && exactShare !== null && row.baseQuantity > 0n
              ? landedUnitCostIqd(row.baseUnitCost, preview.rateFixed, exactShare, row.baseQuantity)
              : null;
          const unit = row.line.sku?.baseUnit ?? "";
          return (
            <div
              key={row.line.key}
              className={`flex flex-col gap-3 rounded-md border p-4 ${blank ? "border-dashed border-border" : "border-border"}`}
              data-testid="invoice-line"
              data-blank={blank ? "true" : "false"}
              data-sku={row.line.sku?.sku ?? ""}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  {t("lineNumber", { number: index + 1 })}
                  {blank ? (
                    <Badge tone="neutral" className="ms-2" data-testid="line-blank-badge">
                      {t("blankLine")}
                    </Badge>
                  ) : null}
                </span>
                {state.lines.length > 1 && !locked ? (
                  <Button size="sm" variant="ghost" onClick={() => set({ lines: state.lines.filter((line) => line.key !== row.line.key) })} aria-label={t("removeLine")}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="md:col-span-2">
                  <Field label={t("sku")} name="variant_id" error={err(`${k}-sku`)}>
                    <div>
                      <SkuPicker value={row.line.sku} onChange={(sku) => setLine(row.line.key, { sku })} testId="line-sku" disabled={locked} />
                    </div>
                  </Field>
                </div>
                <Field key={`packs-${generation}`} label={t("packs")} name="quantity" error={err(`${k}-packs`)} hint={t("packsHint")}>
                  <DecimalInput value={row.line.packs} parse={{ maxDecimals: 3 }} disabled={locked} onValueChange={(_, text) => setLine(row.line.key, { packs: text.trim() })} data-testid="line-packs" />
                </Field>
                <Field key={`size-${generation}`} label={t("packSize", { unit: unit || t("baseUnits") })} name="pack_size" error={err(`${k}-packSize`)}>
                  <DecimalInput value={row.line.packSize} parse={{ maxDecimals: 3 }} disabled={locked} onValueChange={(_, text) => setLine(row.line.key, { packSize: text.trim() })} data-testid="line-pack-size" />
                </Field>
                <Field
                  key={`cost-${generation}`}
                  label={t("costPerPack", { currency: state.currency })}
                  name="unit_cost"
                  error={err(`${k}-cost`)}
                  hint={row.line.lastCost ? t("restock.lastCost", { cost: row.line.lastCost.value, currency: row.line.lastCost.currency }) : undefined}
                >
                  <DecimalInput value={row.line.cost} parse={{ maxDecimals: 6 }} disabled={locked} onValueChange={(_, text) => setLine(row.line.key, { cost: text.trim() })} data-testid="line-cost" />
                </Field>
                <Field label={t("lineLocation")} name="location_id">
                  <Select value={row.line.locationId} disabled={locked} onValueChange={(value) => setLine(row.line.key, { locationId: value })} data-testid="line-location">
                    <option value="">{t("useDefaultLocation")}</option>
                    {locations.map((info) => (
                      <option key={info.id} value={info.id}>
                        {locationLabel(info)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("lot")} name="lot_number">
                  <Input value={row.line.lot} maxLength={80} dir="ltr" disabled={locked} onChange={(event) => setLine(row.line.key, { lot: event.target.value })} data-testid="line-lot" />
                </Field>
                <Field label={row.line.sku?.tracksExpiry ? t("expiryTracked") : t("expiry")} name="expiry_date">
                  <Input type="date" value={row.line.expiry} disabled={locked} onChange={(event) => setLine(row.line.key, { expiry: event.target.value })} data-testid="line-expiry" />
                </Field>
                {state.method === "manual" ? (
                  <Field key={`manual-${generation}`} label={t("manualShare")} name="manual_landed_cost_iqd">
                    <DecimalInput value={row.line.manual} parse={{ maxDecimals: 4 }} disabled={locked} onValueChange={(_, text) => setLine(row.line.key, { manual: text.trim() })} data-testid="line-manual" />
                  </Field>
                ) : null}
              </div>
              <dl className="grid gap-2 rounded-md bg-card p-3 text-sm sm:grid-cols-4" data-testid="line-preview">
                <div>
                  <dt className="text-xs text-text-muted">{t("baseQuantity")}</dt>
                  <dd className="font-semibold" dir="ltr" data-testid="line-base">
                    {fixedText(row.baseQuantity, 3)} {unit}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">{t("costPerBaseUnit")}</dt>
                  <dd className="font-semibold" dir="ltr" data-testid="line-base-cost">
                    {moneyText(row.baseUnitCost, state.currency, Math.max(precision, 2), locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">{t("landedShare")}</dt>
                  <dd className="font-semibold" dir="ltr" data-testid="line-share">
                    {share === null ? t("atPosting") : moneyText(share, "IQD", 0, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">{t("landedUnitCost")}</dt>
                  <dd className="font-semibold" dir="ltr" data-testid="line-landed-unit">
                    {landedUnit === null ? t("atPosting") : moneyText(landedUnit, "IQD", 2, locale)}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
        {locked ? null : (
          <div>
            <Button
              variant="secondary"
              onClick={() => set({ lines: [...state.lines, blankLine(state.nextKey)], nextKey: state.nextKey + 1 })}
              data-testid="invoice-add-line"
            >
              <Plus className="size-4" aria-hidden />
              {t("addLine")}
            </Button>
          </div>
        )}
      </Card>

      {/* ------------------------------------------------- landed costs */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{t("landedCosts")}</h2>
            <p className="text-sm text-text-muted">{t("landedBody")}</p>
          </div>
          <Field label={t("allocation")} name="allocation_method">
            <Select value={state.method} disabled={locked} onValueChange={(value) => set({ method: value as AllocationMethod })} data-testid="invoice-method">
              <option value="value">{t("method.value")}</option>
              <option value="quantity">{t("method.quantity")}</option>
              <option value="manual">{t("method.manual")}</option>
            </Select>
          </Field>
        </div>
        {state.landed.map((cost) => (
          <div key={cost.key} className="grid gap-3 md:grid-cols-[1fr_1fr_8rem_1fr_auto]" data-testid="landed-cost">
            <Field label={t("costKind")} name="kind" error={err(`landed-${cost.key}-kind`)}>
              <Input value={cost.kind} maxLength={40} disabled={locked} onChange={(event) => setLanded(cost.key, { kind: event.target.value })} data-testid="landed-kind" />
            </Field>
            <Field label={t("costDescription")} name="description">
              <Input value={cost.description} maxLength={300} disabled={locked} onChange={(event) => setLanded(cost.key, { description: event.target.value })} />
            </Field>
            <Field label={t("currency")} name="currency_code">
              <Select value={cost.currency} disabled={locked} onValueChange={(value) => setLanded(cost.key, { currency: value as CurrencyCode })} data-testid="landed-currency">
                <option value="IQD">IQD</option>
                <option value="USD">USD</option>
              </Select>
            </Field>
            <Field key={`amount-${generation}`} label={t("amount")} name="amount" error={err(`landed-${cost.key}-amount`)}>
              <DecimalInput value={cost.amount} parse={{ maxDecimals: 6 }} disabled={locked} onValueChange={(_, text) => setLanded(cost.key, { amount: text.trim() })} data-testid="landed-amount" />
            </Field>
            {locked ? null : (
              <Button className="self-end" variant="ghost" onClick={() => set({ landed: state.landed.filter((row) => row.key !== cost.key) })} aria-label={t("removeCost")}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            )}
          </div>
        ))}
        {locked ? null : (
          <div>
            <Button
              variant="secondary"
              onClick={() =>
                set({
                  landed: [...state.landed, { key: state.nextKey, kind: "", description: "", currency: state.currency, amount: "" }],
                  nextKey: state.nextKey + 1,
                })
              }
              data-testid="invoice-add-cost"
            >
              <Plus className="size-4" aria-hidden />
              {t("addCost")}
            </Button>
          </div>
        )}
        {err("allocation") ? <Alert data-testid="allocation-error">{err("allocation")}</Alert> : null}
      </Card>

      {/* --------------------------------------------------------- totals */}
      <Card className="flex flex-col gap-3" data-testid="invoice-totals">
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-text-muted">{t("subtotal")}</dt>
            <dd className="text-lg font-bold" dir="ltr" data-testid="invoice-subtotal">
              {moneyText(preview.subtotal, state.currency, precision, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("landedTotal")}</dt>
            <dd className="text-lg font-bold" dir="ltr" data-testid="invoice-landed-total">
              {money(preview.landedIqd, "IQD")}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("sharesTotal")}</dt>
            <dd className="text-lg font-bold" dir="ltr" data-testid="invoice-shares-total">
              {preview.shown ? moneyText(preview.shown.reduce((a, b) => a + b, 0n), "IQD", 0, locale) : t("atPosting")}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("totalIqd")}</dt>
            <dd className="text-lg font-bold" dir="ltr" data-testid="invoice-total-iqd">
              {money(preview.totalIqd, "IQD")}
            </dd>
          </div>
        </dl>
        {state.currency !== "IQD" ? (
          <p className="text-xs text-text-muted" data-testid="invoice-rate-used">
            {rate ? t("rateUsed", { currency: state.currency, rate }) : t("rateAtPosting")}
            {overridden ? <Badge tone="warning" className="ms-2">{t("rateOverridden")}</Badge> : null}
          </p>
        ) : null}
        {canCost ? null : <p className="text-xs text-text-muted">{t("costHiddenAfter")}</p>}
      </Card>

      {cashAccounts ? (
        <Card className="flex flex-col gap-3" data-testid="invoice-payment">
          <h2 className="text-lg font-bold">{t("payNow.title")}</h2>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="invoice-payment" className="mt-1" checked={state.payment === "owed"} disabled={locked} onChange={() => set({ payment: "owed" })} data-testid="invoice-payment-owed" />
            <span>
              <span className="font-semibold">{t("payNow.owed")}</span>
              <span className="block text-text-muted">{t("payNow.owedHint")}</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="invoice-payment" className="mt-1" checked={state.payment === "now"} disabled={locked} onChange={() => set({ payment: "now" })} data-testid="invoice-payment-now" />
            <span>
              <span className="font-semibold">{t("payNow.now")}</span>
              <span className="block text-text-muted">{t("payNow.nowHint")}</span>
            </span>
          </label>
          {state.payment === "now" ? (
            <p className="text-sm" data-testid="invoice-paid-amount">
              {paidAmount !== null && (!payingAccount || payingAccount.currency_code === state.currency)
                ? t("payNow.amount", { amount: moneyText(toFixed(paidAmount), state.currency, precision, locale) })
                : t("payNow.amountByServer")}
            </p>
          ) : null}
          {state.payment === "now" ? (
            <Field label={t("payNow.account")} name="cash_account_id" error={err("cashAccount")} hint={payable.length ? undefined : t("payNow.noAccount")}>
              <Select value={state.cashAccountId} disabled={locked} onValueChange={(value) => set({ cashAccountId: value })} data-testid="invoice-cash-account">
                <option value="">{t("payNow.pickAccount")}</option>
                {payable.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.currency_code}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </Card>
      ) : null}

      {creatingSupplier ? (
        <SupplierDialog
          supplier={null}
          quick
          onClose={() => setCreatingSupplier(false)}
          onSaved={(created) => {
            setSupplierList((current) => [...current, created]);
            chooseSupplier(created, created.id);
            setCreatingSupplier(false);
          }}
        />
      ) : null}

      <Field label={t("notes")} name="notes">
        <Textarea value={state.notes} maxLength={2000} disabled={locked} onChange={(event) => set({ notes: event.target.value })} />
      </Field>

      {/* --------------------------------------------------------- submit */}
      {review ? (
        <Card className="flex flex-col gap-3" data-testid="invoice-review">
          <p className="text-sm">{t("reviewBody", { lines: postedLines.length, total: money(preview.totalIqd, "IQD") })}</p>
          <ul className="flex flex-col gap-1 text-sm" data-testid="invoice-review-lines">
            {postedLines.map((line) => (
              <li key={line.key} data-testid="invoice-review-line" data-sku={line.sku?.sku}>
                <span className="font-semibold" dir="ltr">{line.sku?.sku}</span> ·{" "}
                <span dir="ltr">
                  {line.packs}
                  {line.packSize && line.packSize !== "1" ? ` × ${line.packSize}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {skipped ? (
            <p className="text-xs text-text-muted" data-testid="invoice-review-skipped">
              {t("skippedLines", { count: skipped })}
            </p>
          ) : null}
          {state.payment === "now" ? (
            <p className="text-sm" data-testid="invoice-review-payment">
              {t("payNow.reviewPaid", { account: payable.find((row) => row.id === state.cashAccountId)?.name ?? "" })}
            </p>
          ) : (
            <p className="text-sm" data-testid="invoice-review-payment">
              {t("payNow.reviewOwed")}
            </p>
          )}
          <PurchasingPostingStatus
            state={posting.state.phase === "posted" ? { phase: "posted", document: postedInvoiceOf(posting.state.document) } : posting.state}
            href={(document) => `/purchasing/invoices/${document.id}`}
            onRetry={() => void confirm()}
            onCheck={() => void posting.check(review.operationId)}
          />
          <div className="flex justify-end gap-2">
            {posted ? null : (
              <>
                <Button variant="ghost" onClick={() => setReview(null)} disabled={busy}>
                  {t("edit")}
                </Button>
                <Button
                  onClick={() => void confirm()}
                  pending={busy}
                  disabled={posting.state.phase === "notPosted" || posting.state.phase === "processing"}
                  data-testid="invoice-confirm"
                >
                  {t("saveAndStock")}
                </Button>
              </>
            )}
          </div>
          {posting.state.phase === "error" ? <Alert tone="info">{t("fixAndReview")}</Alert> : null}
          {posting.state.phase === "error" && state.payment === "now" && isSeparationOfDuties(posting.state.error) ? (
            <Alert tone="info" data-testid="invoice-paid-now-strict">
              <p>{t("payNow.strictSeparation")}</p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={() => {
                  setReview(null);
                  set({ payment: "owed", cashAccountId: "" });
                }}
                data-testid="invoice-record-owed-instead"
              >
                {t("payNow.recordOwedInstead")}
              </Button>
            </Alert>
          ) : null}
          {posted && postedInvoice && state.payment === "now" ? (
            <Alert tone="success" data-testid="invoice-paid-now" data-settlement={postedInvoice.settlement_status ?? ""}>
              {t("payNow.paid", {
                amount: moneyText(toFixed(postedInvoice.total_cost ?? paidAmount ?? 0), postedInvoice.currency_code, precisionOf(postedInvoice.currency_code), locale),
              })}
            </Alert>
          ) : null}
          {posted && postedInvoice && !restock && state.payment === "now" ? (
            <Link className="text-sm font-semibold text-primary-dark hover:underline" href={`/purchasing/invoices/${postedInvoice.id}`} data-testid="invoice-open">
              {t("openInvoice")}
            </Link>
          ) : null}
        </Card>
      ) : (
        <div className="flex justify-end">
          <Button onClick={toReview} data-testid="invoice-review-button">
            {t("review")}
          </Button>
        </div>
      )}
    </div>
  );
}

function DraftBar({
  restoredAt,
  saved,
  onDiscard,
  when,
}: {
  restoredAt: string | null;
  saved: Saved;
  onDiscard: () => void;
  when: (iso: string) => string;
}) {
  const t = useTranslations("purchasing.invoice.draft");
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card px-4 py-2 text-sm" data-testid="draft-bar">
      <span data-testid="draft-status" data-status={saved.status}>
        {restoredAt ? <span data-testid="draft-restored">{t("restored", { at: when(restoredAt) })} · </span> : null}
        {saved.status === "saving"
          ? t("saving")
          : saved.status === "saved"
            ? t("saved", { at: when(saved.at) })
            : saved.status === "failed"
              ? t("failed")
              : t("idle")}
      </span>
      <Button size="sm" variant="ghost" onClick={onDiscard} data-testid="draft-discard">
        {t("discard")}
      </Button>
    </div>
  );
}
