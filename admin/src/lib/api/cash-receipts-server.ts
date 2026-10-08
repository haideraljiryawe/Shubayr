import "server-only";

import { load, type serverApi } from "@/lib/api/server";
import { lastPage } from "@/lib/list-queries";
import { receiptListQuery } from "@/lib/finance/cash-receipts";
import type { TableParams } from "@/lib/table-params";

type Api = Awaited<ReturnType<typeof serverApi>>;

/** Filter choices for the receipt lists: parties, and cash accounts when readable. */
export async function loadReceiptFilterOptions(api: Api) {
  const [parties, accounts] = await Promise.all([
    load(api.GET("/admin/delivery-parties", { params: { query: { per_page: 100 } } })),
    load(api.GET("/admin/cash-accounts")),
  ]);
  return {
    parties: parties.ok ? parties.data.data.map((party) => ({ value: party.id, label: party.name })) : [],
    accounts: accounts.ok
      ? accounts.data.filter((account) => account.currency_code === "IQD").map((account) => ({ value: account.id, label: account.name }))
      : null,
  };
}

/** One page of a receipt list; a page past the end shows the last one. */
export async function loadReceiptPage(api: Api, mode: "vouchers" | "unallocated", params: Pick<TableParams, "filters" | "page" | "perPage">) {
  const { query, ignoredDates } = receiptListQuery(params.filters, params.page, params.perPage);
  const fetchPage = (page: number) =>
    mode === "vouchers"
      ? load(api.GET("/admin/cash-receipts", { params: { query: { ...query, page } } }))
      : load(api.GET("/admin/cash-receipts/unallocated", { params: { query: { ...query, page } } }));
  let result = await fetchPage(params.page);
  if (result.ok && result.data.data.length === 0 && result.data.total > 0 && params.page > 1) {
    result = await fetchPage(lastPage(result.data.total, params.perPage));
  }
  return { result, ignoredDates };
}
