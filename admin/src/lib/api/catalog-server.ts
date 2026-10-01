import "server-only";
import { applicableRate, roundingRule, type Brand, type Category, type RoundingRule } from "../catalog";
import { load, type Loaded, type serverApi } from "./server";

type Api = Awaited<ReturnType<typeof serverApi>>;

/**
 * Every brand, for pickers and filters. The contract pages GET /admin/brands
 * (100 at most per page); a store has tens of brands, so the pages are read
 * through rather than asking the person to page a dropdown.
 */
export async function loadAllBrands(api: Api): Promise<Loaded<Brand[]>> {
  const brands: Brand[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const result = await load(api.GET("/admin/brands", { params: { query: { page, per_page: 100 } } }));
    if (!result.ok) return result;
    brands.push(...result.data.data);
    if (page * result.data.per_page >= result.data.total) break;
  }
  return { ok: true, data: brands };
}

/** The whole category tree, hidden nodes included. */
export function loadCategoryTree(api: Api): Promise<Loaded<Category[]>> {
  return load(api.GET("/admin/categories"));
}

export interface ForeignCurrency {
  code: string;
  name_ar: string;
  name_en: string;
  /** The pricing rate in effect now ("1 code = rate base"), if one exists. */
  rate: string | null;
  rateAt: string | null;
}

export interface PricingContext {
  baseCode: string;
  basePrecision: number;
  foreign: ForeignCurrency[];
  /** Null when the person may not read settings (settings.manage). */
  rounding: RoundingRule | null;
  defaultThreshold: string | null;
}

/**
 * What the SKU editor needs to show a linked price before saving: the
 * enabled foreign currencies with the rate in effect now, and the store's
 * rounding rule. Each part degrades on its own — without ledger.view there
 * are no rates to show, without settings.manage no rounding rule — and the
 * server computes the published price either way.
 */
export async function loadPricingContext(api: Api): Promise<PricingContext> {
  const [currencies, rates, settings] = await Promise.all([
    load(api.GET("/admin/currencies")),
    load(api.GET("/admin/exchange-rates")),
    load(api.GET("/admin/settings")),
  ]);
  const list = currencies.ok ? currencies.data : [];
  const base = list.find((currency) => currency.is_base);
  const basePrecision = base?.display_precision ?? 0;
  const history = rates.ok ? rates.data : [];
  const foreign = list
    .filter((currency) => !currency.is_base && currency.enabled)
    .map((currency) => {
      const current = applicableRate(history.filter((rate) => rate.currency_code === currency.code));
      return {
        code: currency.code,
        name_ar: currency.name_ar,
        name_en: currency.name_en,
        rate: current?.rate === undefined ? null : String(current.rate),
        rateAt: current?.effective_at ?? null,
      };
    });
  const values = settings.ok ? (settings.data.settings ?? {}) : null;
  return {
    baseCode: base?.code ?? "IQD",
    basePrecision,
    foreign,
    rounding: values ? roundingRule(values.sale_rounding_multiple ?? "0", basePrecision) : null,
    defaultThreshold: values ? (values.default_low_stock_threshold ?? null) : null,
  };
}
