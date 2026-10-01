import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { describeLots, loadDocument, loadPermissions, loadWarehouses } from "@/lib/api/inventory-server";
import { serverApi } from "@/lib/api/server";
import { entryHref } from "@/lib/finance/links";
import {
  DOCUMENT_LIST,
  documentHref,
  formatCost,
  formatQuantity,
  isDocumentType,
  locationLabel,
  lotHref,
  shortId,
  stockHref,
  UUID,
  type Opening,
  type Transfer,
  type WriteDown,
} from "@/lib/inventory";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inventory");
  return { title: t("documentTitle") };
}

interface Line {
  id: string;
  batchId: string;
  variantId: string;
  quantity: number;
  locationId?: string;
  fromId?: string;
  toId?: string;
  unitCost?: number;
  landed?: number;
  expiry?: string | null;
}

function linesOf(type: string, document: Opening | Transfer | WriteDown): Line[] {
  if (type === "opening") {
    return (document as Opening).lines.map((line) => ({
      id: line.id,
      batchId: line.lot_id,
      variantId: line.variant_id,
      quantity: line.quantity,
      locationId: line.location_id,
      unitCost: line.unit_cost_iqd,
      landed: line.landed_cost_share,
      expiry: line.expiry_date,
    }));
  }
  if (type === "transfer") {
    return (document as Transfer).lines.map((line) => ({
      id: line.id,
      batchId: line.batch_id,
      variantId: line.variant_id,
      quantity: line.quantity,
      fromId: line.from_location_id,
      toId: line.to_location_id,
    }));
  }
  return (document as WriteDown).lines.map((line) => ({
    id: line.id,
    batchId: line.batch_id,
    variantId: line.variant_id,
    quantity: line.quantity,
    locationId: line.location_id,
    unitCost: line.unit_cost_iqd,
  }));
}

/**
 * One posted inventory document — opening stock, a transfer or a
 * write-down — with its lines named (SKU, lot, location) and linked to the
 * lot and stock views. Unit costs show only with cost.view (the API omits
 * them otherwise, and the columns go with them).
 */
export default async function InventoryDocumentPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if (!isDocumentType(type) || !UUID.test(id)) notFound();
  if (type === "count") redirect(documentHref("count", id));

  const t = await getTranslations("inventory");
  const locale = await getLocale();
  const format = await getFormatter();
  const api = await serverApi();
  const [document, permissions, { locations }] = await Promise.all([
    loadDocument(api, type, id),
    loadPermissions(api),
    loadWarehouses(api),
  ]);
  if (!document.ok) {
    if (document.error.status === 404) notFound();
    return <PageError error={document.error} />;
  }
  const doc = document.data as Opening | Transfer | WriteDown;
  const lines = linesOf(type, doc);
  const lots = await describeLots(api, lines.map((line) => line.batchId));
  const canViewCost = permissions.includes("cost.view");
  const day = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", numberingSystem: "latn", timeZone: "UTC" });
  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" });
  const journal = "journal_entry" in doc ? doc.journal_entry : null;
  const reason = "reason" in doc ? doc.reason : null;
  const where = (locationId: string | undefined) => locationLabel(locationId ? locations.get(locationId) : undefined, shortId(locationId));

  return (
    <>
      <Link href={DOCUMENT_LIST[type]} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t(`documents.${type}`)}
      </Link>
      <PageHeader
        title={<span dir="ltr" data-testid="document-number">{doc.document_number}</span>}
        description={t(`documentsDescription.${type}`)}
      />
      <div className="flex flex-col gap-6" data-testid="inventory-document" data-type={type}>
        <Card>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-text-muted">{t("columns.status")}</dt>
              <dd>
                <Badge tone="success">{t(`documentStatus.${doc.status}`)}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">{t("columns.documentDate")}</dt>
              <dd>{day(doc.document_date)}</dd>
            </div>
            {"accounting_date" in doc ? (
              <div>
                <dt className="text-text-muted">{t("columns.accountingDate")}</dt>
                <dd>{day(doc.accounting_date)}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-text-muted">{t("columns.postedAt")}</dt>
              <dd>{when(doc.posted_at)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">{t("columns.actor")}</dt>
              <dd dir="ltr" title={doc.created_by}>{shortId(doc.created_by)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">{t("columns.journal")}</dt>
              <dd>
                {journal ? (
                  permissions.includes("ledger.view") ? (
                    <Link href={entryHref(journal.id)} className="font-semibold text-primary-dark hover:underline" dir="ltr" data-testid="document-entry">
                      {journal.document_number}
                    </Link>
                  ) : (
                    <span dir="ltr">{journal.document_number}</span>
                  )
                ) : (
                  <span className="text-text-muted">{t("noJournal")}</span>
                )}
              </dd>
            </div>
            {reason ? (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-text-muted">{t("columns.reason")}</dt>
                <dd>{reason}</dd>
              </div>
            ) : null}
          </dl>
        </Card>

        <Card className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm" data-testid="document-lines-table">
            <thead className="text-text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">{t("columns.sku")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("columns.lot")}</th>
                {type === "transfer" ? (
                  <>
                    <th className="px-3 py-2 text-start font-semibold">{t("columns.from")}</th>
                    <th className="px-3 py-2 text-start font-semibold">{t("columns.to")}</th>
                  </>
                ) : (
                  <th className="px-3 py-2 text-start font-semibold">{t("columns.location")}</th>
                )}
                <th className="px-3 py-2 text-end font-semibold">{t("columns.quantity")}</th>
                {canViewCost && type !== "transfer" ? (
                  <th className="px-3 py-2 text-end font-semibold" data-testid="cost-column">{t("columns.unitCost")}</th>
                ) : null}
                {canViewCost && type === "opening" ? <th className="px-3 py-2 text-end font-semibold">{t("columns.landed")}</th> : null}
                {type === "opening" ? <th className="px-3 py-2 text-start font-semibold">{t("columns.expiry")}</th> : null}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const lot = lots.get(line.batchId);
                return (
                  <tr key={line.id} className="border-t border-border" data-testid="document-line">
                    <td className="px-3 py-2 font-semibold" dir="ltr">
                      <Link href={stockHref({ variant_id: line.variantId })} className="hover:underline">
                        {lot?.sku ?? shortId(line.variantId)}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={lotHref(line.batchId)} className="text-primary-dark hover:underline" dir="ltr" data-testid="document-lot">
                        {lot ? (lot.lotNumber ?? t("noLotNumber")) : shortId(line.batchId)}
                      </Link>
                    </td>
                    {type === "transfer" ? (
                      <>
                        <td className="px-3 py-2" dir="ltr">{where(line.fromId)}</td>
                        <td className="px-3 py-2" dir="ltr" data-testid="document-to">{where(line.toId)}</td>
                      </>
                    ) : (
                      <td className="px-3 py-2" dir="ltr">{where(line.locationId)}</td>
                    )}
                    <td className="px-3 py-2 text-end font-semibold" dir="ltr" data-testid="document-quantity">
                      {formatQuantity(line.quantity, locale)}
                    </td>
                    {canViewCost && type !== "transfer" ? (
                      <td className="px-3 py-2 text-end" dir="ltr" data-testid="document-cost">{formatCost(line.unitCost, locale)}</td>
                    ) : null}
                    {canViewCost && type === "opening" ? <td className="px-3 py-2 text-end" dir="ltr">{formatCost(line.landed, locale)}</td> : null}
                    {type === "opening" ? <td className="px-3 py-2" dir="ltr">{line.expiry ? line.expiry.slice(0, 10) : "—"}</td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
