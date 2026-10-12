"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { useTableUrl } from "@/components/table/data-table";
import { browserApi, unwrap } from "@/lib/api/client";
import type { DeliveryParty, PartyKind } from "@/lib/delivery-parties";

export interface PartyChoice {
  id: string;
  name: string;
  phone?: string;
}

const PER_PAGE = 20;

/**
 * Find a delivery party by name, phone or vehicle (GET /admin/delivery-parties
 * `q`, contract 13.4), however many there are: the server searches, and only
 * the newest answer may land. A chosen party shows as a chip until cleared.
 */
export function PartySearch({
  value,
  onChange,
  kind,
  activeOnly = false,
  label,
  testId = "party-search",
  disabled = false,
}: {
  value: PartyChoice | null;
  onChange: (party: PartyChoice | null) => void;
  kind?: PartyKind;
  activeOnly?: boolean;
  label: string;
  testId?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("partySearch");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DeliveryParty[] | null>(null);
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);

  useEffect(() => {
    if (!open) return;
    const ticket = ++sequence.current;
    const timer = setTimeout(() => {
      unwrap(
        browserApi.GET("/admin/delivery-parties", {
          params: {
            query: {
              per_page: PER_PAGE,
              ...(q.trim() ? { q: q.trim().slice(0, 120) } : {}),
              ...(kind ? { kind } : {}),
              ...(activeOnly ? { active: true } : {}),
            },
          },
        }),
      ).then(
        (page) => {
          if (ticket !== sequence.current) return;
          setRows(page.data);
          setFailed(false);
        },
        () => {
          if (ticket === sequence.current) setFailed(true);
        },
      );
    }, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [q, open, kind, activeOnly]);

  if (value) {
    return (
      <div className="flex flex-col gap-1 text-sm font-semibold" data-testid={testId} data-party={value.id}>
        <span>{label}</span>
        <span className="flex h-11 items-center justify-between gap-2 rounded-md border border-border bg-surface px-3">
          <span className="truncate" data-testid={`${testId}-chosen`}>
            {value.name}
            {value.phone ? <span className="ms-2 font-normal text-text-muted" dir="ltr">{value.phone}</span> : null}
          </span>
          {disabled ? null : (
            <button type="button" className="text-text-muted hover:text-text" aria-label={t("clear")} onClick={() => onChange(null)} data-testid={`${testId}-clear`}>
              <X className="size-4" aria-hidden />
            </button>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-1 text-sm font-semibold" data-testid={testId}>
      <label className="flex flex-col gap-1">
        <span>{label}</span>
        <span className="relative">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-text-muted" aria-hidden />
          <Input
            value={q}
            disabled={disabled}
            placeholder={t("placeholder")}
            className="ps-9"
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQ(event.target.value);
              setOpen(true);
            }}
            data-testid={`${testId}-input`}
          />
        </span>
      </label>
      {open ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-surface shadow-lg" data-testid={`${testId}-results`}>
          {failed ? (
            <p className="p-3 text-sm text-error-dark">{t("failed")}</p>
          ) : rows === null ? (
            <p className="p-3 text-sm text-text-muted">{t("loading")}</p>
          ) : rows.length === 0 ? (
            <p className="p-3 text-sm text-text-muted">{t("none")}</p>
          ) : (
            rows.map((party) => (
              <button
                key={party.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm font-normal hover:bg-card"
                onClick={() => {
                  onChange({ id: party.id, name: party.name, phone: party.phone });
                  setOpen(false);
                  setQ("");
                }}
                data-testid={`${testId}-option`}
                data-party={party.id}
              >
                <span className="font-semibold">{party.name}</span>
                <span className="text-text-muted" dir="ltr">
                  {party.phone}
                </span>
              </button>
            ))
          )}
          <div className="border-t border-border p-1 text-end">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {t("close")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A party filter kept in the URL (one key), searched on the server. */
export function PartySearchFilter({
  name,
  label,
  current,
  kind,
}: {
  name: string;
  label: string;
  /** The chosen party's name, when the page knows it. */
  current: PartyChoice | null;
  kind?: PartyKind;
}) {
  const { update, searchParams } = useTableUrl();
  const id = searchParams.get(name);
  const value = id ? (current && current.id === id ? current : { id, name: id.slice(0, 8) }) : null;
  return (
    <div className="w-full sm:w-64">
      <PartySearch
        value={value}
        kind={kind}
        label={label}
        testId={`filter-${name}`}
        onChange={(party) => update({ [name]: party?.id ?? null })}
      />
    </div>
  );
}
