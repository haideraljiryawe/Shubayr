"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { useApiForm } from "@/components/forms/use-api-form";
import { useToast } from "@/components/ui/toast";
import { browserApi, unwrap } from "@/lib/api/client";
import { storeDay } from "@/lib/finance/dates";
import { newOperationId } from "@/lib/finance/operations";
import type { components } from "@/types/api";

type Supplier = components["schemas"]["Supplier"];
type Product = components["schemas"]["Product"];
type Warehouse = components["schemas"]["Warehouse"];
type PurchaseInvoice = components["schemas"]["PurchaseInvoice"];
type CurrencyCode = "IQD" | "USD";
type Allocation = "value" | "quantity" | "manual";

type InvoiceLine = {
  key: string;
  variantId: string;
  locationId: string;
  quantity: string;
  packSize: string;
  unitCost: string;
  lotNumber: string;
  expiryDate: string;
  manualLandedCost: string;
};

type LandedCost = {
  key: string;
  kind: string;
  description: string;
  currencyCode: CurrencyCode;
  amount: string;
};

const blankLine = (): InvoiceLine => ({
  key: crypto.randomUUID(),
  variantId: "",
  locationId: "",
  quantity: "1",
  packSize: "1",
  unitCost: "",
  lotNumber: "",
  expiryDate: "",
  manualLandedCost: "0",
});

const blankCost = (currencyCode: CurrencyCode): LandedCost => ({
  key: crypto.randomUUID(),
  kind: "freight",
  description: "",
  currencyCode,
  amount: "",
});

function readString(value: PurchaseInvoice, key: string): string {
  const found = value[key];
  return typeof found === "string" ? found : "—";
}

function readNumber(value: PurchaseInvoice, key: string): number | null {
  const found = value[key];
  return typeof found === "number" ? found : null;
}

export function PurchasingView({
  suppliers,
  invoices,
  products,
  warehouses,
}: {
  suppliers: Supplier[];
  invoices: PurchaseInvoice[];
  products: Product[];
  warehouses: Warehouse[];
}) {
  const t = useTranslations("purchasing");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const supplierForm = useApiForm();
  const invoiceForm = useApiForm();
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [supplierNotes, setSupplierNotes] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState<CurrencyCode>("IQD");
  const [terms, setTerms] = useState("0");
  const [operationId, setOperationId] = useState(newOperationId);
  const [supplierId, setSupplierId] = useState(suppliers.find((item) => item.is_active)?.id ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [documentDate, setDocumentDate] = useState(storeDay());
  const [dueDate, setDueDate] = useState("");
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>("IQD");
  const [exchangeRate, setExchangeRate] = useState("");
  const locations = useMemo(
    () => warehouses.flatMap((warehouse) => (warehouse.locations ?? []).filter((location) => location.is_active)),
    [warehouses],
  );
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [allocation, setAllocation] = useState<Allocation>("value");
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([blankLine()]);
  const [costs, setCosts] = useState<LandedCost[]>([]);

  const variants = useMemo(
    () => products.flatMap((product) => (product.variants ?? []).map((variant) => ({
      id: variant.id ?? "",
      label: `${variant.sku ?? variant.id} — ${locale === "ar" ? product.name_ar : product.name_en}`,
    }))).filter((variant) => variant.id),
    [locale, products],
  );

  function startSupplier(supplier: Supplier | null) {
    setEditing(supplier);
    setName(supplier?.name ?? "");
    setPhone(supplier?.phone ?? "");
    setEmail(supplier?.email ?? "");
    setAddress(supplier?.address ?? "");
    setSupplierNotes(supplier?.notes ?? "");
    setDefaultCurrency(supplier?.default_currency ?? "IQD");
    setTerms(String(supplier?.payment_terms_days ?? 0));
  }

  async function saveSupplier() {
    const body = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      notes: supplierNotes.trim() || null,
      default_currency: defaultCurrency,
      payment_terms_days: Number(terms),
    };
    const saved = await supplierForm.run(() => editing
      ? unwrap(browserApi.PATCH("/admin/suppliers/{id}", { params: { path: { id: editing.id } }, body }))
      : unwrap(browserApi.POST("/admin/suppliers", { body })));
    if (!saved) return;
    toast(t("supplierSaved"));
    startSupplier(null);
    router.refresh();
  }

  async function deactivate(supplier: Supplier) {
    const saved = await supplierForm.run(() => unwrap(
      browserApi.DELETE("/admin/suppliers/{id}", { params: { path: { id: supplier.id } } }),
    ));
    if (!saved) return;
    toast(t("supplierDeactivated"));
    router.refresh();
  }

  function patchLine(key: string, patch: Partial<InvoiceLine>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }

  function patchCost(key: string, patch: Partial<LandedCost>) {
    setCosts((current) => current.map((cost) => cost.key === key ? { ...cost, ...patch } : cost));
  }

  async function postInvoice() {
    const posted = await invoiceForm.run(() => unwrap(browserApi.POST("/admin/purchase-invoices", {
      body: {
        operation_id: operationId,
        document_date: documentDate,
        supplier_id: supplierId,
        supplier_invoice_number: invoiceNumber.trim() || undefined,
        currency_code: currencyCode,
        ...(currencyCode === "USD" && exchangeRate ? { exchange_rate: exchangeRate } : {}),
        default_location_id: locationId,
        allocation_method: allocation,
        ...(dueDate ? { due_date: dueDate } : {}),
        notes: invoiceNotes.trim() || undefined,
        lines: lines.map((line) => ({
          variant_id: line.variantId,
          ...(line.locationId ? { location_id: line.locationId } : {}),
          quantity: line.quantity,
          pack_size: line.packSize,
          unit_cost: line.unitCost,
          lot_number: line.lotNumber.trim() || undefined,
          expiry_date: line.expiryDate || undefined,
          ...(allocation === "manual" ? { manual_landed_cost_iqd: line.manualLandedCost } : {}),
        })),
        landed_costs: costs.map((cost) => ({
          kind: cost.kind,
          description: cost.description.trim() || undefined,
          currency_code: cost.currencyCode,
          amount: cost.amount,
        })),
      },
    })));
    if (!posted) return;
    toast(t("posted"));
    setOperationId(newOperationId());
    setInvoiceNumber("");
    setInvoiceNotes("");
    setLines([blankLine()]);
    setCosts([]);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-x-auto">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{t("suppliers")}</h2>
          <Button size="sm" onClick={() => startSupplier(null)}><Plus className="size-4" />{t("newSupplier")}</Button>
        </div>
        {suppliers.length === 0 ? <p className="text-sm text-text-muted">{t("empty")}</p> : (
          <table className="w-full text-sm" data-testid="suppliers-table">
            <thead><tr className="text-text-muted"><th className="py-2 text-start">{t("name")}</th><th className="text-start">{t("currency")}</th><th className="text-start">{t("terms")}</th><th className="text-start">{t("status")}</th><th /></tr></thead>
            <tbody>{suppliers.map((supplier) => (
              <tr key={supplier.id} className="border-t border-border">
                <td className="py-2 font-semibold">{supplier.name}</td><td>{supplier.default_currency}</td><td>{supplier.payment_terms_days}</td>
                <td><Badge tone={supplier.is_active ? "success" : "neutral"}>{supplier.is_active ? t("active") : t("inactive")}</Badge></td>
                <td><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => startSupplier(supplier)}>{t("editSupplier")}</Button>{supplier.is_active ? <Button size="sm" variant="ghost" onClick={() => void deactivate(supplier)}>{t("deactivate")}</Button> : null}</div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>

      <Card>
        <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void saveSupplier(); }}>
          <h2 className="text-lg font-bold">{editing ? t("editSupplier") : t("newSupplier")}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t("name")} name="name" error={supplierForm.fieldErrors.name}><Input required value={name} onChange={(event) => setName(event.target.value)} /></Field>
            <Field label={t("phone")} name="phone" error={supplierForm.fieldErrors.phone}><Input value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
            <Field label={t("email")} name="email" error={supplierForm.fieldErrors.email}><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
            <Field label={t("address")} name="address" error={supplierForm.fieldErrors.address}><Input value={address} onChange={(event) => setAddress(event.target.value)} /></Field>
            <Field label={t("currency")} name="default_currency" error={supplierForm.fieldErrors.default_currency}><Select value={defaultCurrency} onChange={(event) => setDefaultCurrency(event.target.value as CurrencyCode)}><option>IQD</option><option>USD</option></Select></Field>
            <Field label={t("terms")} name="payment_terms_days" error={supplierForm.fieldErrors.payment_terms_days}><Input type="number" min="0" max="3650" value={terms} onChange={(event) => setTerms(event.target.value)} /></Field>
          </div>
          <Field label={t("notes")} name="notes" error={supplierForm.fieldErrors.notes}><Textarea value={supplierNotes} onChange={(event) => setSupplierNotes(event.target.value)} /></Field>
          <FormError kind={supplierForm.formError} detail={supplierForm.formErrorDetail} />
          <div className="flex justify-end"><Button type="submit" pending={supplierForm.pending}>{t("save")}</Button></div>
        </form>
      </Card>

      <Card>
        <form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); void postInvoice(); }} data-testid="purchase-invoice-form">
          <h2 className="text-lg font-bold">{t("postInvoice")}</h2>
          {variants.length === 0 || locations.length === 0 ? <Alert tone="info">{variants.length === 0 ? "Create or grant access to at least one SKU. " : ""}{locations.length === 0 ? "Create or grant access to an active warehouse location." : ""}</Alert> : null}
          <div className="grid gap-4 md:grid-cols-4">
            <Field label={t("suppliers")} name="supplier_id" error={invoiceForm.fieldErrors.supplier_id}><Select required value={supplierId} onChange={(event) => { setSupplierId(event.target.value); const supplier = suppliers.find((item) => item.id === event.target.value); if (supplier) { setCurrencyCode(supplier.default_currency); setExchangeRate(supplier.default_currency === "IQD" ? "1" : ""); } }}><option value="" />{suppliers.filter((supplier) => supplier.is_active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</Select></Field>
            <Field label={t("invoiceNumber")} name="supplier_invoice_number" error={invoiceForm.fieldErrors.supplier_invoice_number}><Input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} /></Field>
            <Field label={t("date")} name="document_date" error={invoiceForm.fieldErrors.document_date}><Input required type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} /></Field>
            <Field label={t("dueDate")} name="due_date" error={invoiceForm.fieldErrors.due_date}><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field>
            <Field label={t("currency")} name="currency_code" error={invoiceForm.fieldErrors.currency_code}><Select value={currencyCode} onChange={(event) => { const code = event.target.value as CurrencyCode; setCurrencyCode(code); setExchangeRate(code === "IQD" ? "1" : ""); }}><option>IQD</option><option>USD</option></Select></Field>
            {currencyCode === "USD" ? <Field label={t("exchangeRate")} name="exchange_rate" error={invoiceForm.fieldErrors.exchange_rate}><Input inputMode="decimal" placeholder={t("centralRateDefault")} value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} /></Field> : null}
            <Field label={t("location")} name="default_location_id" error={invoiceForm.fieldErrors.default_location_id}><Select required value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="" />{locations.map((location) => <option key={location.id} value={location.id}>{location.code}</option>)}</Select></Field>
            <Field label={t("allocation")} name="allocation_method" error={invoiceForm.fieldErrors.allocation_method}><Select value={allocation} onChange={(event) => setAllocation(event.target.value as Allocation)}><option value="value">{t("value")}</option><option value="quantity">{t("quantity")}</option><option value="manual">{t("manual")}</option></Select></Field>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between"><h3 className="font-bold">{t("lines")}</h3><Button size="sm" variant="secondary" onClick={() => setLines((current) => [...current, blankLine()])}><Plus className="size-4" />{t("addLine")}</Button></div>
            {lines.map((line, index) => <div key={line.key} className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-4">
              <Field label={t("variant")} name={`lines.${index}.variant_id`} error={invoiceForm.fieldErrors[`lines.${index}.variant_id`]}><Select required value={line.variantId} onChange={(event) => patchLine(line.key, { variantId: event.target.value })}><option value="" />{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}</Select></Field>
              <Field label={t("rowLocation")} name={`lines.${index}.location_id`} error={invoiceForm.fieldErrors[`lines.${index}.location_id`]}><Select value={line.locationId} onChange={(event) => patchLine(line.key, { locationId: event.target.value })}><option value="">{t("useDefaultLocation")}</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.code}</option>)}</Select></Field>
              <Field label={t("packQuantity")} name={`lines.${index}.quantity`} error={invoiceForm.fieldErrors[`lines.${index}.quantity`]}><Input required inputMode="decimal" value={line.quantity} onChange={(event) => patchLine(line.key, { quantity: event.target.value })} /></Field>
              <Field label={t("packSize")} name={`lines.${index}.pack_size`} error={invoiceForm.fieldErrors[`lines.${index}.pack_size`]}><Input required inputMode="decimal" value={line.packSize} onChange={(event) => patchLine(line.key, { packSize: event.target.value })} /></Field>
              <Field label={t("unitCost")} name={`lines.${index}.unit_cost`} error={invoiceForm.fieldErrors[`lines.${index}.unit_cost`]}><Input required inputMode="decimal" value={line.unitCost} onChange={(event) => patchLine(line.key, { unitCost: event.target.value })} /></Field>
              <Field label={t("lot")} name={`lines.${index}.lot_number`} error={invoiceForm.fieldErrors[`lines.${index}.lot_number`]}><Input value={line.lotNumber} onChange={(event) => patchLine(line.key, { lotNumber: event.target.value })} /></Field>
              <Field label={t("expiry")} name={`lines.${index}.expiry_date`} error={invoiceForm.fieldErrors[`lines.${index}.expiry_date`]}><Input type="date" value={line.expiryDate} onChange={(event) => patchLine(line.key, { expiryDate: event.target.value })} /></Field>
              {allocation === "manual" ? <Field label={t("landedCosts")} name={`lines.${index}.manual_landed_cost_iqd`} error={invoiceForm.fieldErrors[`lines.${index}.manual_landed_cost_iqd`]}><Input inputMode="decimal" value={line.manualLandedCost} onChange={(event) => patchLine(line.key, { manualLandedCost: event.target.value })} /></Field> : null}
              {lines.length > 1 ? <Button className="self-end" size="sm" variant="ghost" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}><Trash2 className="size-4" />{t("remove")}</Button> : null}
            </div>)}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between"><h3 className="font-bold">{t("landedCosts")}</h3><Button size="sm" variant="secondary" onClick={() => setCosts((current) => [...current, blankCost(currencyCode)])}><Plus className="size-4" />{t("addCost")}</Button></div>
            {costs.map((cost, index) => <div key={cost.key} className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-5">
              <Field label={t("costKind")} name={`landed_costs.${index}.kind`} error={invoiceForm.fieldErrors[`landed_costs.${index}.kind`]}><Input required value={cost.kind} onChange={(event) => patchCost(cost.key, { kind: event.target.value })} /></Field>
              <Field label={t("notes")} name={`landed_costs.${index}.description`} error={invoiceForm.fieldErrors[`landed_costs.${index}.description`]}><Input value={cost.description} onChange={(event) => patchCost(cost.key, { description: event.target.value })} /></Field>
              <Field label={t("currency")} name={`landed_costs.${index}.currency_code`} error={invoiceForm.fieldErrors[`landed_costs.${index}.currency_code`]}><Select value={cost.currencyCode} onChange={(event) => patchCost(cost.key, { currencyCode: event.target.value as CurrencyCode })}><option>IQD</option><option>USD</option></Select></Field>
              <Field label={t("amount")} name={`landed_costs.${index}.amount`} error={invoiceForm.fieldErrors[`landed_costs.${index}.amount`]}><Input required inputMode="decimal" value={cost.amount} onChange={(event) => patchCost(cost.key, { amount: event.target.value })} /></Field>
              <Button className="self-end" size="sm" variant="ghost" onClick={() => setCosts((current) => current.filter((item) => item.key !== cost.key))}><Trash2 className="size-4" />{t("remove")}</Button>
            </div>)}
          </div>
          <Field label={t("notes")} name="notes" error={invoiceForm.fieldErrors.notes}><Textarea value={invoiceNotes} onChange={(event) => setInvoiceNotes(event.target.value)} /></Field>
          <FormError kind={invoiceForm.formError} detail={invoiceForm.formErrorDetail} />
          <div className="flex justify-end"><Button type="submit" pending={invoiceForm.pending} disabled={!supplierId || !locationId || lines.some((line) => !line.variantId || !line.unitCost)}>{t("postInvoice")}</Button></div>
        </form>
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="mb-4 text-lg font-bold">{t("invoices")}</h2>
        {invoices.length === 0 ? <p className="text-sm text-text-muted">{t("empty")}</p> : <table className="w-full text-sm"><thead><tr className="text-text-muted"><th className="py-2 text-start">{t("documentNumber")}</th><th className="text-start">{t("invoiceNumber")}</th><th className="text-start">{t("currency")}</th><th className="text-end">{t("total")}</th><th className="text-start">{t("status")}</th></tr></thead><tbody>{invoices.map((invoice, index) => <tr key={invoice.id ?? index} className="border-t border-border"><td className="py-2 font-semibold">{readString(invoice, "document_number")}</td><td>{readString(invoice, "supplier_invoice_number")}</td><td>{readString(invoice, "currency_code")}</td><td className="text-end" dir="ltr">{readNumber(invoice, "total_iqd")?.toLocaleString(locale) ?? "—"}</td><td><Badge tone="success">{readString(invoice, "status")}</Badge></td></tr>)}</tbody></table>}
      </Card>
    </div>
  );
}
