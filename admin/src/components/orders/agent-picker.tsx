"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Alert, Input } from "@/components/ui";
import { browserApi, unwrap } from "@/lib/api/client";
import { errorKind, type ErrorKind } from "@/lib/api/errors";
import { FormError } from "@/components/forms/form-error";
import type { components } from "@/types/api";

type DeliveryAgent = components["schemas"]["DeliveryAgent"];

const PER_PAGE = 20;

/**
 * Choose a delivery agent from GET /admin/delivery-agents (contract 8.0,
 * #65): active agents only, searched by name or phone on the server, gated by
 * orders.assign_agent alone — assigning no longer needs users.manage.
 *
 * Typing is debounced, and only the newest search may land: an older, slower
 * answer never replaces a newer one.
 */
export function AgentPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (agent: DeliveryAgent | null) => void;
}) {
  const t = useTranslations("orders.assign");
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ rows: DeliveryAgent[]; total: number } | null>(null);
  const [error, setError] = useState<ErrorKind | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const ticket = ++sequence.current;
    const timer = setTimeout(() => {
      unwrap(
        browserApi.GET("/admin/delivery-agents", {
          params: { query: { per_page: PER_PAGE, ...(q.trim() ? { q: q.trim().slice(0, 80) } : {}) } },
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
    <div className="flex flex-col gap-2" data-testid="agent-picker">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
        <Input
          type="search"
          className="ps-9"
          value={q}
          placeholder={t("search")}
          aria-label={t("search")}
          onChange={(event) => setQ(event.target.value)}
          data-testid="agent-search"
        />
      </div>
      <FormError kind={error} />
      {result === null ? (
        <div className="h-16 animate-pulse rounded-md bg-card" aria-busy />
      ) : result.rows.length === 0 ? (
        <p className="text-xs text-text-muted" data-testid="agent-none">
          {q.trim() ? t("noMatch") : t("noAgents")}
        </p>
      ) : (
        <fieldset className="flex max-h-56 flex-col gap-1 overflow-y-auto" aria-label={t("pick")}>
          {result.rows.map((agent) => (
            <label
              key={agent.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-card"
              data-testid="agent-option"
              data-agent-id={agent.id}
            >
              <input
                type="radio"
                name="agent"
                checked={value === agent.id}
                onChange={() => onChange(agent)}
              />
              <span className="font-semibold">{agent.name}</span>
              <span className="text-xs text-text-muted" dir="ltr">{agent.phone}</span>
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
