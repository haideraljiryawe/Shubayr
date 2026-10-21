import { describe, expect, it } from "vitest";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import { ApiError, SEPARATION_CODES, describeError, describeFieldError, isSeparationRefusal } from "@/lib/api/errors";
import { displayTitle, formFromBanner, isLegacyOnly, removalBlocked, swapBody, swapCandidates, type Banner } from "@/lib/banners";
import { receiptRefusal } from "@/lib/finance/cash-receipts";
import { exceptionRefusal } from "@/lib/finance/custody-exceptions";
import { isSeparationOfDuties } from "@/lib/purchasing";
import { returnRefusal } from "@/lib/returns";

const banner = (over: Partial<Banner> = {}): Banner => ({
  id: "b-1",
  title: "عروض",
  subtitle: null,
  image_url: "http://localhost:8000/api/v1/media/m-1",
  cta_text: null,
  link_url: null,
  internal_name: "Winter",
  title_ar: "عروض",
  title_en: null,
  subtitle_ar: null,
  subtitle_en: null,
  cta_label_ar: null,
  cta_label_en: null,
  show_text: true,
  action_type: "none",
  action_target_id: null,
  action: { type: "none", url: null, target: null },
  is_default: false,
  default_priority: 0,
  sort_order: 0,
  is_active: true,
  effective_status: "active",
  starts_at: null,
  ends_at: null,
  created_at: "2026-10-01T09:00:00.000Z",
  removal: { allowed: true, reason_code: null },
  ...over,
});

/* A tiny translator over the English catalog, like next-intl's `t` scoped to "errors". */
const catalog = en.errors as unknown as Record<string, unknown>;
const lookup = (key: string) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], catalog);
const t = Object.assign(
  (key: string, values: Record<string, string | number> = {}) =>
    String(lookup(key) ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`)),
  { has: (key: string) => typeof lookup(key) === "string" },
);

describe("raw admin banner translations (17.9.0)", () => {
  it("a missing translation is an empty field, not a copy of the other language", () => {
    const form = formFromBanner(banner());
    expect(form.titleAr).toBe("عروض");
    expect(form.titleEn).toBe("");
    // Customers in English still see the Arabic text, as the list shows it.
    expect(displayTitle(banner(), "en")).toBe("عروض");
    expect(displayTitle(banner({ title_ar: null, title_en: null, title: "Legacy" }), "ar")).toBe("Legacy");
  });

  it("recognises an older banner with only the legacy title", () => {
    expect(isLegacyOnly(banner({ title_ar: null, title_en: null, title: "Legacy" }))).toBe(true);
    expect(isLegacyOnly(banner())).toBe(false);
  });
});

describe("default banner swap and removal protection", () => {
  it("says up front when the API would refuse a delete or switch-off", () => {
    expect(removalBlocked(banner({ removal: { allowed: false, reason_code: "BANNER_DEFAULT_MINIMUM_REQUIRED" } }))).toBe(true);
    expect(removalBlocked(banner())).toBe(false);
  });

  it("offers only regular, enabled, in-date banners as the replacement", () => {
    const outgoing = banner({ id: "d1", is_default: true });
    const list = [
      outgoing,
      banner({ id: "d2", is_default: true }),
      banner({ id: "r1" }),
      banner({ id: "off", is_active: false, effective_status: "disabled" }),
      banner({ id: "later", effective_status: "scheduled" }),
    ];
    expect(swapCandidates(list, outgoing).map((row) => row.id)).toEqual(["r1"]);
  });

  it("keeps the outgoing priority unless a whole number is typed", () => {
    const outgoing = banner({ id: "d1", is_default: true, default_priority: 3 });
    expect(swapBody(outgoing, "r1")).toEqual({ outgoing_id: "d1", incoming_id: "r1" });
    expect(swapBody(outgoing, "r1", " 5 ")).toEqual({ outgoing_id: "d1", incoming_id: "r1", default_priority: 5 });
    expect(swapBody(outgoing, "r1", "x")).toEqual({ outgoing_id: "d1", incoming_id: "r1" });
  });
});

describe("separation-of-duties codes (17.9.0)", () => {
  it("the new strict code and the deprecated one mean the same everywhere", () => {
    for (const code of SEPARATION_CODES) {
      const error = new ApiError(409, "x", code);
      expect(isSeparationRefusal(error)).toBe(true);
      expect(isSeparationOfDuties(error)).toBe(true);
      expect(receiptRefusal(error)).toBe("strictAllocation");
      expect(exceptionRefusal(error)).toBe("separation");
      expect(returnRefusal(error)).toBe(code);
    }
    expect(isSeparationRefusal(new ApiError(409, "x", "CONFLICT"))).toBe(false);
  });

  it("a party acting on its own custody is its own refusal now", () => {
    expect(exceptionRefusal(new ApiError(403, "x", "SELF_CUSTODY_CASH_ACTION_FORBIDDEN"))).toBe("ownCustody");
  });
});

describe("C20 refusal messages", () => {
  it("word the new codes in both languages and show the API's bounds", () => {
    for (const code of [
      "STRICT_SEPARATION_OF_DUTIES_REQUIRED",
      "PAID_NOW_AMOUNT_CONFLICT",
      "BANNER_DEFAULT_SWAP_INVALID",
      "BANNER_DEFAULT_REPLACEMENT_NOT_USABLE",
      "DELIVERY_COLLECTED_AMOUNT_OUT_OF_RANGE",
      "DELIVERY_PARTY_SELECTOR_INVALID",
    ]) {
      expect((en.errors.codes as Record<string, string>)[code], code).toBeTruthy();
      expect((ar.errors.codes as Record<string, string>)[code], code).toBeTruthy();
    }
    const field = { field: "collected_amount", code: "DELIVERY_COLLECTED_AMOUNT_OUT_OF_RANGE", message: "x", min: 0, max: "25000" };
    expect(describeFieldError(t, field)).toBe("The collected amount is outside what this order allows. Allowed: 0 to 25000.");
    expect(describeError(t, new ApiError(422, "x", "DELIVERY_COLLECTED_AMOUNT_OUT_OF_RANGE", [field]))).toContain("Allowed: 0 to 25000.");
    expect(describeFieldError(t, { code: "DELIVERY_PARTY_SELECTOR_INVALID" })).toBe("Choose exactly one delivery party.");
  });
});
