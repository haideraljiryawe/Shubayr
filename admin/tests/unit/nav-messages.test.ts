import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import { NAV_ITEMS } from "@/lib/nav";
import type { Blocker, FareBearer, FareMethod, Trip, TripOrder, TripStatus } from "@/lib/trips";
import type { Notice } from "@/app/(admin)/deliveries/trips/[id]/trip-view";
import type { components } from "@/types/api";

/**
 * Every sidebar entry has its label, and its card on the dashboard has its
 * description, in both languages: a missing one only shows up as a server
 * log line (MISSING_MESSAGE), so it is checked here.
 */
describe("nav messages", () => {
  for (const [locale, messages] of [["en", en], ["ar", ar]] as const) {
    it(`${locale}: every nav item has a label and a dashboard description`, () => {
      const nav = messages.nav as Record<string, string>;
      const sections = messages.dashboard.section as Record<string, string>;
      for (const item of NAV_ITEMS) {
        expect(nav[item.key], `nav.${item.key}`).toBeTruthy();
        if (item.key !== "dashboard") expect(sections[item.key], `dashboard.section.${item.key}`).toBeTruthy();
      }
    });
  }
});

/* ---------------------------------------------------------------------------
 * The trips screens: every message key they use exists in both languages.
 *
 * The source is read, not rendered: each `useTranslations("trips…")` /
 * `getTranslations("trips…")` binding is followed to the calls made through
 * it. A literal key must exist as written. A key built from a value
 * (`events.${event.type}`) must have a row in VALUES below, which lists every
 * value that value can take — and those lists are checked against the API's
 * own types by the compiler, so a new enum value (a new trip event, say)
 * fails the typecheck until it is listed here, and this test until both
 * languages translate it.
 * ------------------------------------------------------------------------- */

/** A list that names every member of T exactly (a missing one is a type error). */
function every<T extends string>() {
  return <const L extends readonly T[]>(
    list: L & ([Exclude<T, L[number]>] extends [never] ? unknown : { missing: Exclude<T, L[number]> }),
  ): readonly string[] => list;
}

type TripEventType = components["schemas"]["ExternalDriverTripEvent"]["type"];
type DeliveryStatus = TripOrder["delivery"]["status"];
type ExceptionType = TripOrder["exceptions"][number]["type"];
type SettlementResult = NonNullable<Trip["settlement"]["result"]>;

/** Every dynamic key prefix the trips screens build, with the values it takes. */
const VALUES: Record<string, readonly string[]> = {
  "trips.events.": every<TripEventType>()(["handover", "started", "delivered", "failed", "return_at_door", "lost", "closed"]),
  "trips.statuses.": every<TripStatus>()(["open", "in_progress", "closed"]),
  "trips.bearers.": every<FareBearer>()(["store", "customer_direct"]),
  "trips.methods.": every<FareMethod>()(["payable", "cash_account", "driver_keeps", "customer_direct"]),
  "trips.create.bearerHints.": every<FareBearer>()(["store", "customer_direct"]),
  "trips.create.methodHints.": every<FareMethod>()(["payable", "cash_account", "driver_keeps", "customer_direct"]),
  "trips.blockers.": every<Blocker>()(["notDelivered", "unconfirmed"]),
  "trips.deliveryStatuses.": every<DeliveryStatus>()(["assigned", "out_for_delivery", "delivered", "failed", "returned"]),
  "trips.exceptionTypes.": every<ExceptionType>()(["goods_loss", "return_against_uncollected", "delivery_fee_refund"]),
  "trips.detail.results.": every<SettlementResult>()(["settled", "settlement_open"]),
  "trips.detail.notice.": every<Notice["kind"]>()(["added", "started", "delivered", "failed", "closed"]),
  // The three journal entries a closed trip links to (accrual, payment, netting).
  "trips.detail.entries.": ["0", "1", "2"],
};

const SRC = join(__dirname, "../../src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

interface Use {
  file: string;
  key: string;
  dynamic: boolean;
}

/** Every key used through a translator bound to the trips namespace. */
function tripsKeys(): Use[] {
  const uses: Use[] = [];
  const binding = /const (\w+) = (?:use|await get)Translations\("([\w.]+)"\)/g;
  for (const path of sourceFiles(SRC)) {
    const source = readFileSync(path, "utf8");
    const bindings = [...source.matchAll(binding)].map((match) => ({
      name: match[1],
      namespace: match[2],
      at: match.index ?? 0,
    }));
    if (!bindings.some((entry) => entry.namespace === "trips" || entry.namespace.startsWith("trips."))) continue;
    const call = /(?<![\w.$])(\w+)(?:\.(?:rich|markup))?\((?:"([^"]+)"|`([^`]+)`)/g;
    for (const match of source.matchAll(call)) {
      const at = match.index ?? 0;
      // The binding in force: the nearest one of this name before the call.
      const bound = bindings.filter((entry) => entry.name === match[1] && entry.at < at).at(-1);
      if (!bound || !(bound.namespace === "trips" || bound.namespace.startsWith("trips."))) continue;
      const literal = match[2];
      const template = match[3];
      const file = relative(SRC, path);
      if (literal !== undefined) uses.push({ file, key: `${bound.namespace}.${literal}`, dynamic: false });
      else uses.push({ file, key: `${bound.namespace}.${template.split("${")[0]}`, dynamic: template.includes("${") });
    }
  }
  return uses;
}

function lookup(messages: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>(
    (node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
    messages,
  );
}

describe("trips messages", () => {
  const uses = tripsKeys();

  it("finds the trips screens and their keys", () => {
    expect(new Set(uses.map((use) => use.file)).size).toBeGreaterThanOrEqual(5);
    expect(uses.some((use) => use.key === "trips.events." && use.dynamic)).toBe(true);
  });

  it("knows the values of every key built from a value", () => {
    const unknown = [...new Set(uses.filter((use) => use.dynamic && !(use.key in VALUES)).map((use) => `${use.key}… (${use.file})`))];
    expect(unknown, "add these prefixes to VALUES").toEqual([]);
  });

  for (const [locale, messages] of [["en", en], ["ar", ar]] as const) {
    it(`${locale}: every key the trips screens use exists`, () => {
      const missing = new Set<string>();
      for (const use of uses) {
        const keys = use.dynamic ? (VALUES[use.key] ?? []).map((value) => `${use.key}${value}`) : [use.key];
        for (const key of keys) {
          if (typeof lookup(messages, key) !== "string") missing.add(`${key} (${use.file})`);
        }
      }
      expect([...missing]).toEqual([]);
    });
  }
});
