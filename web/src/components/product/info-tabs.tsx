"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

export type SpecRow = { label: string; value: string };

/**
 * «الوصف» / «المواصفات» as a proper ARIA tablist with arrow-key navigation.
 * Both panels stay in the DOM (the inactive one hidden) so the description is
 * still crawlable when the specifications tab is the default.
 */
export function InfoTabs({
  description,
  specs,
}: {
  description: string;
  specs: SpecRow[];
}) {
  const t = useTranslations("product");
  const baseId = useId();
  const [active, setActive] = useState<"description" | "specs">("description");

  const tabs = [
    { key: "description" as const, label: t("description") },
    { key: "specs" as const, label: t("specifications") },
  ];

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    // Order follows the tab array; direction is handled by the browser's
    // reading order, so simply toggle between the two.
    setActive((current) =>
      current === "description" ? "specs" : "description",
    );
  };

  return (
    <section className="mt-10">
      <div
        role="tablist"
        aria-label={t("description")}
        onKeyDown={onKeyDown}
        className="flex gap-1 border-b border-border"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            id={`${baseId}-${tab.key}-tab`}
            aria-selected={active === tab.key}
            aria-controls={`${baseId}-${tab.key}-panel`}
            tabIndex={active === tab.key ? 0 : -1}
            onClick={() => setActive(tab.key)}
            className={cn(
              "-mb-px border-b-2 px-4 py-3 text-sm font-semibold transition-colors",
              active === tab.key
                ? "border-primary-dark text-primary-dark"
                : "border-transparent text-text-muted hover:text-text",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-description-panel`}
        aria-labelledby={`${baseId}-description-tab`}
        hidden={active !== "description"}
        className="pt-5 text-sm leading-7 text-text-muted"
      >
        <p>{description}</p>
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-specs-panel`}
        aria-labelledby={`${baseId}-specs-tab`}
        hidden={active !== "specs"}
        className="pt-5"
      >
        {specs.length === 0 ? (
          <p className="text-sm text-text-muted">{t("noSpecifications")}</p>
        ) : (
          <dl className="divide-y divide-border rounded-md border border-border">
            {specs.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <dt className="text-sm text-text-muted">{row.label}</dt>
                <dd className="text-sm font-medium text-text">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
