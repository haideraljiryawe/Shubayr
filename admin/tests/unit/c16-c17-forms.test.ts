import { describe, expect, it } from "vitest";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import { ApiError } from "@/lib/api/errors";
import { MANAGED_KINDS, PARTY_KINDS, courierBody, courierPatch, courierValues, managedPartyPath, partyListQuery, type DeliveryParty } from "@/lib/delivery-parties";
import { limitBody, limitDraft, limitPatch, switchLimit, validateLimit } from "@/lib/purchase-limit";
import { recentlyAddedApiProblems, recentlyAddedPatch, toRecentlyAddedForm, validateRecentlyAdded } from "@/lib/recently-added";
import type { AdminSettings } from "@/lib/store-info";

/* --------------------------------------------------------- per-order limit */

describe("per-order purchase limit", () => {
  it("prefills 10 only when switched on with no value, and keeps a value when switched off", () => {
    const off = limitDraft({ purchase_limit_enabled: false, purchase_limit_max_quantity: null });
    expect(off).toEqual({ enabled: false, max: "" });
    expect(switchLimit(off, true)).toEqual({ enabled: true, max: "10" });
    expect(switchLimit({ enabled: false, max: "4" }, true)).toEqual({ enabled: true, max: "4" });
    expect(switchLimit({ enabled: true, max: "4" }, false)).toEqual({ enabled: false, max: "4" });
    // A new product starts off: nothing is prefilled until someone asks for a limit.
    expect(limitDraft(null)).toEqual({ enabled: false, max: "" });
  });

  it("validates the maximum: required, positive, three decimals, whole for piece-only products", () => {
    const on = (max: string) => ({ enabled: true, max });
    expect(validateLimit({ enabled: false, max: "" }, { wholeUnitsOnly: true })).toBeNull();
    expect(validateLimit(on(""), { wholeUnitsOnly: true })).toBe("required");
    expect(validateLimit(on("abc"), { wholeUnitsOnly: true })).toBe("invalid");
    expect(validateLimit(on("0"), { wholeUnitsOnly: true })).toBe("positive");
    expect(validateLimit(on("-2"), { wholeUnitsOnly: true })).toBe("positive");
    expect(validateLimit(on("1.2345"), { wholeUnitsOnly: false })).toBe("precision");
    expect(validateLimit(on("2.5"), { wholeUnitsOnly: true })).toBe("wholeUnits");
    expect(validateLimit(on("2.5"), { wholeUnitsOnly: false })).toBeNull();
    // Arabic digits are accepted.
    expect(validateLimit(on("٣"), { wholeUnitsOnly: true })).toBeNull();
  });

  it("sends the switch and the maximum for the whole product; an edit only when it changed", () => {
    expect(limitBody({ enabled: true, max: "٣" })).toEqual({ purchase_limit_enabled: true, purchase_limit_max_quantity: 3 });
    expect(limitBody({ enabled: false, max: "3" })).toEqual({ purchase_limit_enabled: false });
    const stored = { purchase_limit_enabled: true, purchase_limit_max_quantity: 3 };
    expect(limitPatch(stored, { enabled: true, max: "3" })).toEqual({});
    expect(limitPatch(stored, { enabled: true, max: "5" })).toEqual({ purchase_limit_enabled: true, purchase_limit_max_quantity: 5 });
    expect(limitPatch(stored, { enabled: false, max: "3" })).toEqual({ purchase_limit_enabled: false });
    expect(limitPatch({ purchase_limit_enabled: false, purchase_limit_max_quantity: 3 }, { enabled: false, max: "9" })).toEqual({});
  });
});

/* ------------------------------------------------------------ recently added */

const settings = (values: Record<string, string | null>): AdminSettings => ({ settings: values }) as unknown as AdminSettings;

describe("Recently Added settings", () => {
  it("reads the stored strings, with the API's defaults when missing", () => {
    expect(toRecentlyAddedForm(settings({}))).toEqual({ enabled: false, maxCount: "10", windowDays: "30" });
    expect(
      toRecentlyAddedForm(settings({ recently_added_enabled: "true", recently_added_max_count: "12", recently_added_window_days: "7" })),
    ).toEqual({ enabled: true, maxCount: "12", windowDays: "7" });
  });

  it("checks the API's bounds: 1–50 products, 1–365 days, whole numbers", () => {
    const base = { enabled: true, maxCount: "10", windowDays: "30" };
    expect(validateRecentlyAdded(base)).toEqual({});
    expect(validateRecentlyAdded({ ...base, maxCount: "0", windowDays: "366" })).toEqual({ maxCount: "minimum", windowDays: "maximum" });
    expect(validateRecentlyAdded({ ...base, maxCount: "51" })).toEqual({ maxCount: "maximum" });
    expect(validateRecentlyAdded({ ...base, maxCount: "2.5", windowDays: "" })).toEqual({ maxCount: "wholeNumber", windowDays: "required" });
    expect(validateRecentlyAdded({ ...base, maxCount: "٥٠", windowDays: "٣٦٥" })).toEqual({});
  });

  it("sends only what changed, as the strings the API stores", () => {
    const before = { enabled: false, maxCount: "10", windowDays: "30" };
    expect(recentlyAddedPatch(before, before)).toBeNull();
    expect(recentlyAddedPatch(before, { enabled: true, maxCount: "٠١٢", windowDays: "30" })).toEqual({
      settings: { recently_added_enabled: "true", recently_added_max_count: "12" },
    });
  });

  it("maps the API's per-field errors back to the fields", () => {
    const error = new ApiError(422, "Validation", "VALIDATION_FAILED", [
      { field: "settings.recently_added_max_count", code: "maximum", message: "x" },
      { field: "settings.recently_added_window_days", code: "positive_integer", message: "x" },
      { field: "settings.currency", code: "required", message: "x" },
    ]);
    expect(recentlyAddedApiProblems(error)).toEqual({ maxCount: "maximum", windowDays: "wholeNumber" });
    expect(recentlyAddedApiProblems(new Error("x"))).toEqual({});
  });
});

/* ---------------------------------------------------------- courier companies */

const party = (over: Partial<DeliveryParty> = {}): DeliveryParty => ({
  id: "p-1",
  kind: "courier_company",
  user_id: null,
  name: "Fast Box",
  phone: "+9647701234567",
  contact_person: "Ali",
  vehicle_number: null,
  description: null,
  notes: null,
  is_active: true,
  created_at: "2026-10-20T00:00:00Z",
  updated_at: "2026-10-20T00:00:00Z",
  ...over,
});

describe("courier companies", () => {
  it("are a party kind the list can filter by, and managed beside external drivers", () => {
    expect(PARTY_KINDS).toContain("courier_company");
    expect(MANAGED_KINDS).toEqual(["external_driver", "courier_company"]);
    expect(partyListQuery({ q: "", page: 1, perPage: 20, filters: { kind: "courier_company" } })).toMatchObject({ kind: "courier_company" });
    expect(managedPartyPath("courier_company")).toBe("/admin/courier-companies/{id}");
    expect(managedPartyPath("external_driver")).toBe("/admin/external-drivers/{id}");
  });

  it("create: company name, phone in E.164, optional contact person left out when empty", () => {
    expect(courierBody({ companyName: " Fast Box ", phone: "07701234567", contactPerson: " ", notes: "" })).toEqual({
      company_name: "Fast Box",
      phone: "+9647701234567",
    });
    expect(courierBody({ companyName: "Fast Box", phone: "07701234567", contactPerson: "Ali", notes: "Night shift" })).toEqual({
      company_name: "Fast Box",
      phone: "+9647701234567",
      contact_person: "Ali",
      notes: "Night shift",
    });
  });

  it("edit: only what changed; clearing the contact person sends an empty string", () => {
    const stored = party();
    expect(courierPatch(stored, courierValues(stored))).toBeNull();
    expect(courierPatch(stored, { ...courierValues(stored), contactPerson: "" })).toEqual({ contact_person: "" });
    expect(courierPatch(stored, { ...courierValues(stored), phone: "07709999999" })).toEqual({ phone: "+9647709999999" });
  });
});

describe("C16/C17 messages", () => {
  const keys = (value: unknown, prefix = ""): string[] =>
    value && typeof value === "object"
      ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
      : [prefix.slice(0, -1)];
  const pick = (catalog: Record<string, unknown>, path: string) => path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], catalog);

  it("exist in both languages", () => {
    for (const ns of ["recentlyAdded", "products.limit", "parties", "purchasing.supplierPicker", "purchasing.invoice.payNow", "banners", "orders.assign.kinds"]) {
      const inAr = keys(pick(ar as Record<string, unknown>, ns)).sort();
      expect(inAr.length, ns).toBeGreaterThan(0);
      expect(inAr, ns).toEqual(keys(pick(en as Record<string, unknown>, ns)).sort());
    }
  });
});
