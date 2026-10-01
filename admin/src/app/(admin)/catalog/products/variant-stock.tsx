import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Card } from "@/components/ui";
import type { ProductVariant } from "@/lib/catalog";
import { availabilityTone, formatQuantity, stockHref, type StockTotals } from "@/lib/inventory";

/**
 * Stock per SKU, read-only. Stock changes only through inventory documents
 * (opening, transfer, count, write-down), never from the product editor, so
 * this shows where each SKU stands and links to its stock view.
 *
 * Available and the low/out state are the catalog's own (sellable,
 * unexpired, unreserved stock against the SKU's threshold); on hand and
 * reserved come from the lot balances and need inventory.view.
 */
export async function VariantStock({
  variants,
  totals,
}: {
  variants: ProductVariant[];
  /** By variant id; null without inventory.view. */
  totals: Record<string, StockTotals> | null;
}) {
  const t = await getTranslations("inventory");
  const locale = await getLocale();
  const qty = (value: number | null | undefined) => formatQuantity(value, locale);
  if (variants.length === 0) return null;

  return (
    <Card className="mb-6 overflow-x-auto" data-testid="variant-stock">
      <h2 className="font-bold">{t("productStock.title")}</h2>
      <p className="mb-3 text-sm text-text-muted">{t("productStock.body")}</p>
      <table className="w-full min-w-[36rem] text-sm">
        <thead className="text-text-muted">
          <tr>
            <th className="px-3 py-2 text-start font-semibold">{t("columns.sku")}</th>
            <th className="px-3 py-2 text-end font-semibold">{t("columns.available")}</th>
            <th className="px-3 py-2 text-start font-semibold">{t("columns.state")}</th>
            {totals ? (
              <>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.reserved")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.onHand")}</th>
                <th className="px-3 py-2" />
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {variants.map((variant) => {
            const row = variant.id ? totals?.[variant.id] : undefined;
            return (
              <tr key={variant.id} className="border-t border-border" data-testid="variant-stock-row" data-sku={variant.sku}>
                <td className="px-3 py-2 font-semibold" dir="ltr">{variant.sku}</td>
                <td className="px-3 py-2 text-end" dir="ltr" data-testid="variant-stock-available">
                  {qty(variant.available_qty ?? 0)} <span className="text-text-muted">{variant.base_unit}</span>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={availabilityTone(variant.availability)}>{t(`availability.${variant.availability ?? "out_of_stock"}`)}</Badge>
                </td>
                {totals ? (
                  <>
                    <td className="px-3 py-2 text-end" dir="ltr" data-testid="variant-stock-reserved">{qty(row?.reserved ?? 0)}</td>
                    <td className="px-3 py-2 text-end" dir="ltr">{qty(row?.onHand ?? 0)}</td>
                    <td className="px-3 py-2 text-end">
                      <Link href={stockHref({ variant_id: variant.id })} className="font-semibold text-primary-dark hover:underline" data-testid="variant-stock-link">
                        {t("productStock.view")}
                      </Link>
                    </td>
                  </>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
