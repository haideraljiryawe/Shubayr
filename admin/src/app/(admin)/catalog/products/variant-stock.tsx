import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Card } from "@/components/ui";
import { BASE_UNITS, type ProductVariant } from "@/lib/catalog";
import { availabilityTone, formatQuantity, stockHref, type StockTotals } from "@/lib/inventory";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/table/table";

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
  const tUnits = await getTranslations("products.units");
  const unitName = (unit: string | undefined) =>
    (BASE_UNITS as readonly string[]).includes(unit ?? "piece") ? tUnits((unit ?? "piece") as (typeof BASE_UNITS)[number]) : (unit ?? "");
  const locale = await getLocale();
  const qty = (value: number | null | undefined) => formatQuantity(value, locale);
  if (variants.length === 0) return null;

  return (
    <Card className="mb-6 overflow-x-auto" data-testid="variant-stock">
      <h2 className="font-bold">{t("productStock.title")}</h2>
      <p className="mb-3 text-sm text-text-muted">{t("productStock.body")}</p>
      <Table minWidth="36rem">
        <THead>
          <Tr>
            <Th>{t("columns.sku")}</Th>
            <Th>{t("columns.available")}</Th>
            <Th>{t("columns.state")}</Th>
            {totals ? (
              <>
                <Th>{t("columns.reserved")}</Th>
                <Th>{t("columns.onHand")}</Th>
                <Th />
              </>
            ) : null}
          </Tr>
        </THead>
        <TBody>
          {variants.map((variant) => {
            const row = variant.id ? totals?.[variant.id] : undefined;
            return (
              <Tr key={variant.id} data-testid="variant-stock-row" data-sku={variant.sku}>
                <Td className="font-semibold" dir="ltr">{variant.sku}</Td>
                <Td dir="ltr" data-testid="variant-stock-available">
                  {qty(variant.available_qty ?? 0)} <span className="text-text-muted">{unitName(variant.base_unit)}</span>
                </Td>
                <Td>
                  <Badge tone={availabilityTone(variant.availability)}>{t(`availability.${variant.availability ?? "out_of_stock"}`)}</Badge>
                </Td>
                {totals ? (
                  <>
                    <Td dir="ltr" data-testid="variant-stock-reserved">{qty(row?.reserved ?? 0)}</Td>
                    <Td dir="ltr">{qty(row?.onHand ?? 0)}</Td>
                    <Td align="end">
                      <Link href={stockHref({ variant_id: variant.id })} className="font-semibold text-primary-dark hover:underline" data-testid="variant-stock-link">
                        {t("productStock.view")}
                      </Link>
                    </Td>
                  </>
                ) : null}
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </Card>
  );
}
