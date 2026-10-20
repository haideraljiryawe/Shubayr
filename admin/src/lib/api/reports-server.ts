import "server-only";
import { load, type Loaded, type serverApi } from "./server";
import type { ReportId, ReportQuery } from "@/lib/reports";

type Api = Awaited<ReturnType<typeof serverApi>>;

/** Typed literal dispatch: dynamic OpenAPI paths are deliberately impossible. */
export async function loadReport(api: Api, id: ReportId, query: ReportQuery): Promise<Loaded<unknown>> {
  const init = { params: { query: query as never } };
  switch (id) {
    case "sales": return load(api.GET("/admin/reports/sales", init));
    case "profitability": return load(api.GET("/admin/reports/profitability", init));
    case "profit-loss": return load(api.GET("/admin/reports/profit-loss", init));
    case "trial-balance": return load(api.GET("/admin/reports/trial-balance", init));
    case "balance-sheet": return load(api.GET("/admin/reports/balance-sheet", init));
    case "cash": return load(api.GET("/admin/reports/cash", init));
    case "delivery-custody": return load(api.GET("/admin/reports/delivery-custody", init));
    case "liabilities": return load(api.GET("/admin/reports/liabilities", init));
    case "inventory-valuation": return load(api.GET("/admin/reports/inventory-valuation", init));
    case "purchases": return load(api.GET("/admin/reports/purchases", init));
    case "supplier-statement": return load(api.GET("/admin/reports/supplier-statement", init));
    case "stock-movement": return load(api.GET("/admin/reports/stock-movement", init));
    case "expenses": return load(api.GET("/admin/reports/expenses", init));
  }
}

