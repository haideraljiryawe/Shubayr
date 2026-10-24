"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStoredPreference } from "@/lib/stored-preference";
import {
  activeNavGroup,
  type NavEntry,
  type NavGroupKey,
  type NavItem,
  type NavKey,
} from "@/lib/nav";
import { GROUP_ICONS, NAV_ICONS as ICONS } from "./nav-icons";

/** Which groups the person opened, remembered across visits on this browser. */
const OPEN_GROUPS_KEY = "shubayr.admin.nav.open";

function parseOpenGroups(stored: string): NavGroupKey[] {
  try {
    const value: unknown = JSON.parse(stored || "[]");
    return Array.isArray(value) ? value.filter((key): key is NavGroupKey => typeof key === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The two-level sidebar (VIS-002): Home and Reports as direct links, every
 * other page inside a collapsible group. The whole group row toggles it; the
 * group holding the current page is always open and marked lighter, the page
 * itself green. A collapsed group keeps its links in the page (hidden), so
 * the menu's contents do not depend on what is expanded.
 */
export function SidebarNav({
  entries,
  active,
  onNavigate,
  testId = "sidebar-nav",
}: {
  entries: readonly NavEntry[];
  active: NavKey | null;
  onNavigate?: () => void;
  testId?: string;
}) {
  const t = useTranslations("nav");
  const activeGroup = activeNavGroup(entries, active);
  const [stored, store] = useStoredPreference(OPEN_GROUPS_KEY);
  const open = parseOpenGroups(stored);

  // The active group starts open on every navigation, whatever was stored.
  const [closedActive, setClosedActive] = useState(false);
  const [lastActive, setLastActive] = useState(active);
  if (active !== lastActive) {
    setLastActive(active);
    setClosedActive(false);
  }

  function toggle(key: NavGroupKey) {
    // Collapsing the current page's group is allowed; it reopens when the
    // person lands on another of its pages.
    const isOpen = open.includes(key) || (key === activeGroup && !closedActive);
    const next = isOpen ? open.filter((value) => value !== key) : [...open, key];
    if (key === activeGroup) setClosedActive(isOpen);
    store(JSON.stringify(next));
  }

  return (
    <nav aria-label={t("label")} data-testid={testId}>
      <ul className="flex flex-col gap-1">
        {entries.map((entry) => {
          if (entry.kind === "link") {
            return (
              <li key={entry.item.key}>
                <NavLink item={entry.item} active={entry.item.key === active} onNavigate={onNavigate} />
              </li>
            );
          }
          const isActiveGroup = entry.key === activeGroup;
          const expanded = open.includes(entry.key) || (isActiveGroup && !closedActive);
          const Icon = GROUP_ICONS[entry.key];
          const listId = `${testId}-group-${entry.key}`;
          return (
            <li key={entry.key} data-nav-group={entry.key}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={listId}
                onClick={() => toggle(entry.key)}
                data-testid={`nav-group-${entry.key}`}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-start text-label transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                  isActiveGroup ? "bg-primary/10 text-primary-dark" : "text-text hover:bg-card",
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">{t(`groups.${entry.key}`)}</span>
                <ChevronDown
                  className={cn("size-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none", expanded ? "rotate-180" : "")}
                  aria-hidden
                />
              </button>
              <ul id={listId} hidden={!expanded} className="mt-1 flex flex-col gap-0.5 border-s border-border ms-5 ps-2">
                {entry.items.map((item) => (
                  <li key={item.key}>
                    <NavLink item={item} active={item.key === active} onNavigate={onNavigate} child />
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function NavLink({
  item,
  active,
  child = false,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  child?: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const Icon = ICONS[item.key];
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      data-testid={`nav-${item.key}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 text-label transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
        child ? "py-2" : "py-2.5",
        active ? "bg-primary-dark text-on-primary" : "text-text hover:bg-card",
      )}
    >
      <Icon className={cn("shrink-0", child ? "size-4" : "size-5")} aria-hidden />
      {t(item.key)}
    </Link>
  );
}
