import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { MovementsTable } from "@/components/inventory/movements-table";
import { describeLots, loadPermissions, loadWarehouses } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { storeDay } from "@/lib/finance/dates";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import {
  formatCost,
  formatQuantity,
  isExpired,
  locationLabel,
  movementQuery,
  sourceLink,
  stockHref,
  UUID,
} from "@/lib/inventory";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inventory.lot");
  return { title: t("title") };
}

/**
 * One lot: where it came from, where it sits now (on hand, reserved and
 * available per location, plus what is out in delivery custody), and its
 * movement history filtered by the API. A transfer moves the lot between
 * locations without changing its identity, so its whole life is here.
 */
export default async function LotPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const t = await getTranslations("inventory");
  const locale = await getLocale();
  const format = await getFormatter();
  const table = parseTableParams(await searchParams, {
    sortKeys: ["created_at"],
    defaultSort: "created_at",
    defaultDir: "desc",
    filterKeys: ["type", "location_id"],
  });
  const api = await serverApi();
  const [lot, movements, permissions, { locations }, names] = await Promise.all([
    load(api.GET("/admin/inventory/lots/{id}", { params: { path: { id } } })),
    load(api.GET("/admin/inventory/movements", { params: { query: { ...movementQuery(table), batch_id: id } } })),
    loadPermissions(api),
    loadWarehouses(api),
    describeLots(api, [id]),
  ]);
  if (!lot.ok) {
    if (lot.error.status === 404) notFound();
    return <PageError error={lot.error} />;
  }
  if (!movements.ok) return <PageError error={movements.error} />;
  const row = lot.data;
  const info = names.get(id);
  const canViewCost = permissions.includes("cost.view");
  const source = sourceLink({ source_type: row.source_type ?? "", source_id: row.source_id });
  const today = storeDay();
  const day = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", numberingSystem: "latn", timeZone: "UTC" });
  const qty = (value: number | undefined) => formatQuantity(value, locale);

  return (
    <>
      <Link href={stockHref({ batch_id: id })} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("lot.backToStock")}
      </Link>
      <PageHeader
        title={
          <span dir="ltr" data-testid="lot-number">
            {row.lot_number ?? t("noLotNumber")}
          </span>
        }
        description={info ? t("lot.ofSku", { sku: info.sku }) : t("lot.description")}
      />
      <div className="flex flex-col gap-6" data-testid="lot-detail" data-lot-id={id}>
        <Card>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-text-muted">{t("columns.sku")}</dt>
              <dd className="font-semibold" dir="ltr">
                {row.variant_id ? (
                  <Link href={stockHref({ variant_id: row.variant_id })} className="hover:underline" data-testid="lot-sku">
                    {info?.sku ?? row.variant_id.slice(0, 8)}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">{t("columns.received")}</dt>
              <dd>
                <span dir="ltr">{qty(row.qty_received)}</span>
                {row.entry_date ? <span className="text-text-muted"> · {day(row.entry_date)}</span> : null}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">{t("columns.expiry")}</dt>
              <dd className="flex items-center gap-2">
                <span dir="ltr">{row.expiry_date ? row.expiry_date.slice(0, 10) : t("lot.noExpiry")}</span>
                {isExpired(row.expiry_date, today) ? <Badge tone="danger">{t("expired")}</Badge> : null}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">{t("columns.source")}</dt>
              <dd>
                {source.kind === "none" ? (
                  <span>{t.has(`source.${row.source_type}`) ? t(`source.${row.source_type}`) : row.source_type}</span>
                ) : (
                  <Link href={source.href} className="font-semibold text-primary-dark hover:underline" data-testid="lot-source">
                    {t.has(`source.${row.source_type}`) ? t(`source.${row.source_type}`) : row.source_type}
                  </Link>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">{t("columns.custody")}</dt>
              <dd dir="ltr" data-testid="lot-custody">{qty(row.custody)}</dd>
            </div>
            {canViewCost ? (
              <>
                <div>
                  <dt className="text-text-muted">{t("columns.unitCost")}</dt>
                  <dd dir="ltr" data-testid="lot-cost">{formatCost(row.purchase_cost, locale)}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t("columns.landed")}</dt>
                  <dd dir="ltr">{formatCost(row.landed_cost_share, locale)}</dd>
                </div>
              </>
            ) : null}
          </dl>
        </Card>

        <Card className="overflow-x-auto">
          <h2 className="mb-3 font-bold">{t("lot.where")}</h2>
          <table className="w-full min-w-[36rem] text-sm" data-testid="lot-balances">
            <thead className="text-text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">{t("columns.location")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.onHand")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.reserved")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.available")}</th>
              </tr>
            </thead>
            <tbody>
              {(row.batch_stock ?? []).map((balance) => (
                <tr key={balance.id} className="border-t border-border" data-testid="lot-balance" data-location={balance.location.code}>
                  <td className="px-3 py-2" dir="ltr">
                    {locationLabel(locations.get(balance.location_id), balance.location.code ?? "")}
                    {balance.location.is_sellable ? null : (
                      <Badge tone="warning" className="ms-2">
                        {t("nonSellable")}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-end" dir="ltr" data-testid="lot-balance-on-hand">{qty(balance.quantity)}</td>
                  <td className="px-3 py-2 text-end" dir="ltr">{qty(balance.reserved)}</td>
                  <td className="px-3 py-2 text-end font-semibold" dir="ltr">{qty(balance.available)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <section className="flex flex-col gap-3">
          <h2 className="font-bold">{t("lot.history")}</h2>
          <MovementsTable
            rows={movements.data.data}
            state={{ page: movements.data.page, perPage: movements.data.per_page, total: movements.data.total, sort: "created_at", dir: "desc" }}
            locations={Object.fromEntries(locations)}
            filters={table.filters}
            canViewCost={canViewCost}
            showLot={false}
          />
        </section>
      </div>
    </>
  );
}
