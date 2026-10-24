"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Search, UserPlus } from "lucide-react";
import { Alert, Badge, buttonClasses, Input } from "@/components/ui";
import { browserApi, unwrap } from "@/lib/api/client";
import { errorKind, type ErrorKind } from "@/lib/api/errors";
import { FormError } from "@/components/forms/form-error";
import { PARTY_TONE, type DeliveryParty } from "@/lib/delivery-parties";

const PER_PAGE = 20;

/**
 * Choose who carries the order from GET /admin/delivery-parties (contract
 * 11.2, 17.8.0): active internal agents, external drivers and courier
 * companies, searched by name, phone or vehicle on the server, gated by
 * orders.assign_agent alone.
 *
 * Typing is debounced, and only the newest search may land: an older, slower
 * answer never replaces a newer one.
 *
 * With no delivery party at all, it says so and leads straight to adding one
 * (the store's own driver or a courier company) instead of a dead end.
 */
export function PartyPicker({
  value,
  onChange,
  addPartyHref = null,
}: {
  value: string;
  onChange: (party: DeliveryParty | null) => void;
  /** Where to add a delivery party, when this person may; null says who can. */
  addPartyHref?: string | null;
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
      ) : result.rows.length === 0 && q.trim() ? (
        <p className="text-caption text-text-muted" data-testid="party-none">
          {t("noMatch")}
        </p>
      ) : result.rows.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border p-3" data-testid="party-none">
          <p className="text-body">{t("noPartiesYet")}</p>
          {addPartyHref ? (
            <Link href={addPartyHref} className={buttonClasses({ size: "sm" })} data-testid="party-add-first">
              <UserPlus className="size-4" aria-hidden />
              {t("addFirstParty")}
            </Link>
          ) : (
            <p className="text-caption text-text-muted">{t("askToAddParty")}</p>
          )}
        </div>
      ) : (
        <fieldset className="flex max-h-56 flex-col gap-1 overflow-y-auto" aria-label={t("pick")}>
          {result.rows.map((party) => (
            <label
              key={party.id}
              className="flex cursor-pointer flex-wrap items-center gap-2 rounded-md px-2 py-1.5 text-body hover:bg-card"
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
              <span className="text-caption text-text-muted" dir="ltr">{party.phone}</span>
              {party.contact_person ? <span className="text-caption text-text-muted">{party.contact_person}</span> : null}
              <Badge tone={PARTY_TONE[party.kind]}>{t(`kinds.${party.kind}`)}</Badge>
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
