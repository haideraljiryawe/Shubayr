import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { buttonClasses, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { collectionListQuery, PARTY_COLLECTION_FILTER_KEYS } from "@/lib/collection";
import { STATEMENT_FILTER_KEYS, statementQuery } from "@/lib/delivery-parties";
import { UUID } from "@/lib/inventory";
import { lastPage } from "@/lib/list-queries";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { PartyCollections } from "./party-collections";
import { PartyTabs } from "./party-tabs";
import { PartyView } from "./party-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("parties");
  return { title: t("detail.title") };
}

/**
 * One delivery party (deliveries.manage), in two tabs:
 * - custody: what they hold right now (goods and cash, with ages), the
 *   orders those goods belong to, and their custody statement with a running
 *   balance, filtered and paged by the server. Lot costs and values appear
 *   only with cost.view — the API leaves them out otherwise.
 * - collections (`?tab=collections`, contract 13.1): every order they
 *   delivered and what was collected for it, filtered and paged by the server.
 */
export default async function DeliveryPartyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const t = await getTranslations("parties");
  const raw = await searchParams;
  if (raw.tab === "collections") return <CollectionsTab id={id} raw={raw} />;
  const table = parseTableParams(raw, {
    sortKeys: ["occurred_at"],
    defaultSort: "occurred_at",
    filterKeys: STATEMENT_FILTER_KEYS,
  });
  const api = await serverApi();
  const query = (page: number) => statementQuery(table.filters, page, table.perPage);
  const [custody, held, first, permissions] = await Promise.all([
    load(api.GET("/admin/delivery-parties/{id}/custody", { params: { path: { id } } })),
    load(api.GET("/admin/delivery-parties/{id}/orders", { params: { path: { id } } })),
    load(api.GET("/admin/delivery-parties/{id}/statement", { params: { path: { id }, query: query(table.page) } })),
    loadPermissions(api),
  ]);
  if (!custody.ok) {
    if (custody.error.status === 404) notFound();
    return <PageError error={custody.error} />;
  }
  if (!held.ok) return <PageError error={held.error} />;
  let statement = first;
  if (statement.ok && statement.data.data.length === 0 && statement.data.total > 0 && table.page > 1) {
    statement = await load(
      api.GET("/admin/delivery-parties/{id}/statement", {
        params: { path: { id }, query: query(lastPage(statement.data.total, table.perPage)) },
      }),
    );
  }
  if (!statement.ok) return <PageError error={statement.error} />;
  const party = custody.data.party;
  const orderId = table.filters.order_id && UUID.test(table.filters.order_id) ? table.filters.order_id : null;

  return (
    <>
      <Link href="/delivery-parties" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("backToList")}
      </Link>
      <PageHeader
        title={<span data-testid="party-name">{party.name}</span>}
        description={t("detail.description")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/finance/cash-receipts?party_id=${id}`} className={buttonClasses({ variant: "secondary" })} data-testid="party-receipts">
              {t("cash.receipts")}
            </Link>
            {/* Only when there is cash to hand in: no dead buttons. */}
            {permissions.includes("cash_receipts.receive") && party.is_active && custody.data.cash.amount > 0 ? (
              <Link href={`/finance/cash-receipts/new?party_id=${id}`} className={buttonClasses()} data-testid="party-receive">
                {t("cash.receive")}
              </Link>
            ) : null}
          </div>
        }
      />
      <PartyTabs partyId={id} active="custody" />
      <PartyView
        custody={custody.data}
        held={held.data.data}
        statement={statement.data.data}
        cashActivity={statement.data.cash_activity}
        statementState={{ page: statement.data.page, perPage: statement.data.per_page, total: statement.data.total, sort: "occurred_at", dir: "asc" }}
        orderFilter={orderId}
        canViewCost={permissions.includes("cost.view")}
      />
    </>
  );
}

/** The collections tab: the party (for its name) and one page of collections. */
async function CollectionsTab({ id, raw }: { id: string; raw: RawSearchParams }) {
  const t = await getTranslations("parties");
  const table = parseTableParams(raw, {
    sortKeys: ["delivered_at"],
    defaultSort: "delivered_at",
    filterKeys: PARTY_COLLECTION_FILTER_KEYS,
  });
  const api = await serverApi();
  const { query, ignored } = collectionListQuery(table.filters, table.page, table.perPage);
  const list = (page: number) =>
    load(api.GET("/admin/delivery-parties/{id}/collections", { params: { path: { id }, query: { ...query, page } } }));
  const [custody, first] = await Promise.all([
    load(api.GET("/admin/delivery-parties/{id}/custody", { params: { path: { id } } })),
    list(table.page),
  ]);
  if (!custody.ok) {
    if (custody.error.status === 404) notFound();
    return <PageError error={custody.error} />;
  }
  let collections = first;
  if (collections.ok && collections.data.data.length === 0 && collections.data.total > 0 && table.page > 1) {
    collections = await list(lastPage(collections.data.total, table.perPage));
  }
  if (!collections.ok) return <PageError error={collections.error} />;
  const party = custody.data.party;

  return (
    <>
      <Link href="/delivery-parties" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("backToList")}
      </Link>
      <PageHeader title={<span data-testid="party-name">{party.name}</span>} description={t("collections.description")} />
      <PartyTabs partyId={id} active="collections" />
      <PartyCollections
        partyId={id}
        rows={collections.data.data}
        state={{ page: collections.data.page, perPage: collections.data.per_page, total: collections.data.total, sort: "delivered_at", dir: "asc" }}
        orderFilter={query.order_id ?? null}
        ignored={ignored}
      />
    </>
  );
}
