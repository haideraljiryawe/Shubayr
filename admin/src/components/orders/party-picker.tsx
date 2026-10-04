"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Alert, Badge, Input } from "@/components/ui";
import { browserApi, unwrap } from "@/lib/api/client";
import { errorKind, type ErrorKind } from "@/lib/api/errors";
import { FormError } from "@/components/forms/form-error";
import type { components } from "@/types/api";

type DeliveryParty = components["schemas"]["DeliveryParty"];

const PER_PAGE = 20;

/**
 * Choose who carries the order from GET /admin/delivery-parties (contract
 * 11.2): active internal agents and external drivers, searched by name,
 * phone or vehicle on the server, gated by orders.assign_agent alone.
 *
 * Typing is debounced, and only the newest search may land: an older, slower
 * answer never replaces a newer one.
 */
export function PartyPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (party: DeliveryParty | null) => void;
}) {
  const t = useTranslations("orders.assign");
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ rows: DeliveryParty[]; total: number } | null>(null);
  const [error, setError] = useState<ErrorKind | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const ticket = ++sequence.current;
    const timer = setTimeout(() => {
      unwrap(
        browserApi.GET("/admin/delivery-parties", {
          params: { query: { active: true, per_page: PER_PAGE, ...(q.trim() ? { q: q.trim().slice(0, 120) } : {}) } },
        }),
      ).then(
        (page) => {
          if (ticket !== sequence.current) return;
          setResult({ rows: page.data ?? [], total: page.total ?? 0 });
          setError(null);
        },
        (cause: unknown) => {
          if (ticket === sequence.current) setError(errorKind(cause));
        },
      );
    }, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="flex flex-col gap-2" data-testid="party-picker">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
        <Input
          type="search"
          className="ps-9"
          value={q}
          placeholder={t("search")}
          aria-label={t("search")}
          onChange={(event) => setQ(event.target.value)}
          data-testid="party-search"
        />
      </div>
      <FormError kind={error} />
      {result === null ? (
        <div className="h-16 animate-pulse rounded-md bg-card" aria-busy />
      ) : result.rows.length === 0 ? (
        <p className="text-xs text-text-muted" data-testid="party-none">
          {q.trim() ? t("noMatch") : t("noParties")}
        </p>
      ) : (
        <fieldset className="flex max-h-56 flex-col gap-1 overflow-y-auto" aria-label={t("pick")}>
          {result.rows.map((party) => (
            <label
              key={party.id}
              className="flex cursor-pointer flex-wrap items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-card"
              data-testid="party-option"
              data-party-id={party.id}
              data-kind={party.kind}
            >
              <input
                type="radio"
                name="party"
                checked={value === party.id}
                onChange={() => onChange(party)}
              />
              <span className="font-semibold">{party.name}</span>
              <span className="text-xs text-text-muted" dir="ltr">{party.phone}</span>
              <Badge tone={party.kind === "external_driver" ? "warning" : "info"}>{t(`kinds.${party.kind}`)}</Badge>
            </label>
          ))}
        </fieldset>
      )}
      {result && result.total > result.rows.length ? (
        <Alert tone="info">{t("refine", { shown: result.rows.length, total: result.total })}</Alert>
      ) : null}
    </div>
  );
}
