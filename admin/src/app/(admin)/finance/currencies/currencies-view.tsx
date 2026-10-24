"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Lock, TriangleAlert } from "lucide-react";
import { Alert, Badge, Button, Card } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { FormError } from "@/components/forms/form-error";
import { browserApi, unwrap } from "@/lib/api/client";
import { errorKind, type ErrorKind, errorCode } from "@/lib/api/errors";
import { formatRate as rateText } from "@/lib/finance/money";
import type { components } from "@/types/api";
import { RateForm } from "./rate-form";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/table/table";

type Currency = components["schemas"]["Currency"];
type ExchangeRate = components["schemas"]["ExchangeRate"];

export function CurrenciesView({
  currencies,
  rates,
  authors,
  canToggle,
  canRate,
  canPublish,
}: {
  currencies: Currency[];
  rates: ExchangeRate[];
  authors: Record<string, string>;
  canToggle: boolean;
  canRate: boolean;
  /** prices.publish_linked: may publish linked prices with a new rate. */
  canPublish: boolean;
}) {
  const t = useTranslations("currencies");
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const toast = useToast();
  const base = currencies.find((currency) => currency.is_base);
  const baseCode = base?.code ?? "IQD";
  const foreign = currencies.filter((currency) => !currency.is_base && currency.enabled);

  const [toggling, setToggling] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<{ code: string; kind: ErrorKind; errorCode: string | null } | null>(null);

  async function toggle(currency: Currency) {
    setToggling(currency.code);
    setToggleError(null);
    try {
      await unwrap(
        browserApi.PATCH("/admin/currencies/{code}", {
          params: { path: { code: currency.code } },
          body: { enabled: !currency.enabled },
        }),
      );
      toast(currency.enabled ? t("disabled") : t("enabled"));
      router.refresh();
    } catch (cause) {
      setToggleError({
        code: currency.code,
        kind: errorKind(cause),
        errorCode: errorCode(cause) ?? null,
      });
    } finally {
      setToggling(null);
    }
  }

  const dateTime = (iso: string | null | undefined) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" }) : "—";

  // Newest first per currency, so each rate's predecessor is the next row.
  const byCurrency = new Map<string, ExchangeRate[]>();
  for (const rate of rates) {
    const code = rate.currency_code ?? "";
    byCurrency.set(code, [...(byCurrency.get(code) ?? []), rate]);
  }
  const previousOf = (rate: ExchangeRate) => {
    const list = byCurrency.get(rate.currency_code ?? "") ?? [];
    return list[list.indexOf(rate) + 1] ?? null;
  };
  const staleLatest = [...byCurrency.entries()]
    .map(([code, list]) => ({ code, latest: list[0] }))
    .filter(({ latest }) => latest?.not_from_today);

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5">
        <h2 className="mb-3 text-section">{t("currencies")}</h2>
        <Table data-testid="currency-table">
          <THead>
            <Tr>
              <Th>{t("columns.code")}</Th>
              <Th>{t("columns.name")}</Th>
              <Th>{t("columns.symbol")}</Th>
              <Th>{t("columns.precision")}</Th>
              <Th>{t("columns.status")}</Th>
            </Tr>
          </THead>
          <TBody>
            {currencies.map((currency) => (
              <Tr key={currency.code} data-testid={`currency-${currency.code}`}>
                <Td className="font-semibold" dir="ltr">{currency.code}</Td>
                <Td>{locale === "ar" ? currency.name_ar : currency.name_en}</Td>
                <Td dir="ltr">{currency.symbol}</Td>
                <Td>{currency.display_precision}</Td>
                <Td>
                  {currency.is_base ? (
                    <span className="inline-flex items-center gap-1" data-testid="currency-base">
                      <Lock className="size-3.5" aria-hidden />
                      <Badge tone="info">{t("base")}</Badge>
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Badge tone={currency.enabled ? "success" : "neutral"}>
                        {currency.enabled ? t("on") : t("off")}
                      </Badge>
                      {canToggle ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          pending={toggling === currency.code}
                          onClick={() => void toggle(currency)}
                          data-testid={`currency-toggle-${currency.code}`}
                        >
                          {currency.enabled ? t("disable") : t("enable")}
                        </Button>
                      ) : null}
                    </div>
                  )}
                  {toggleError?.code === currency.code ? (
                    <FormError kind={toggleError.kind} code={toggleError.errorCode} />
                  ) : null}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        <p className="mt-3 text-caption text-text-muted">{t("baseLocked")}</p>
      </Card>

      {staleLatest.map(({ code, latest }) => (
        <Alert key={code} tone="info" data-testid={`rate-stale-${code}`}>
          <span className="inline-flex items-center gap-2">
            <TriangleAlert className="size-4" aria-hidden />
            {t("staleCurrent", { code, date: dateTime(latest.effective_at) })}
          </span>
        </Alert>
      ))}

      {canRate ? (
        foreign.length ? (
          <RateForm
            foreign={foreign}
            baseCode={baseCode}
            basePrecision={base?.display_precision ?? 0}
            canPublish={canPublish}
            onSaved={() => router.refresh()}
          />
        ) : (
          <Alert tone="info">{t("noForeign")}</Alert>
        )
      ) : null}

      <Card className="overflow-x-auto p-5">
        <h2 className="mb-3 text-section">{t("history.title")}</h2>
        {rates.length === 0 ? (
          <p className="text-body text-text-muted" data-testid="rate-history-empty">{t("history.empty")}</p>
        ) : (
          <Table data-testid="rate-history">
            <THead>
              <Tr>
                <Th>{t("history.effective")}</Th>
                <Th>{t("history.rate")}</Th>
                <Th>{t("history.previous")}</Th>
                <Th>{t("history.by")}</Th>
                <Th>{t("history.reason")}</Th>
              </Tr>
            </THead>
            <TBody>
              {rates.map((rate) => {
                const previous = previousOf(rate);
                return (
                  <Tr key={rate.id} className="align-top" data-testid="rate-row" data-rate={String(rate.rate)}>
                    <Td>
                      {dateTime(rate.effective_at)}
                      <span className="block text-caption text-text-muted">
                        {t("history.recorded", { at: dateTime(rate.created_at) })}
                      </span>
                    </Td>
                    <Td className="font-semibold" dir="ltr">
                      {rateText(rate.currency_code ?? "", rate.base_currency_code ?? baseCode, rate.rate ?? "0", locale)}
                    </Td>
                    <Td className="text-text-muted" dir="ltr">
                      {previous ? `${String(previous.rate)} → ${String(rate.rate)}` : t("history.first")}
                    </Td>
                    <Td>{(rate.id && authors[rate.id]) || shortId(rate.set_by)}</Td>
                    <Td>{rate.reason}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function shortId(id: string | undefined): string {
  return id ? id.slice(0, 8) : "—";
}
