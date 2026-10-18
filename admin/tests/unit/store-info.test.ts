import { describe, expect, it } from "vitest";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import { ApiError } from "@/lib/api/errors";
import { isRouteEnabled, parseModules } from "@/lib/modules";
import {
  STORE_INFO_KEYS,
  storeInfoApiProblems,
  storeInfoPatch,
  storedValue,
  toStoreInfoForm,
  validateStoreInfo,
  type AdminSettings,
  type StoreInfoForm,
} from "@/lib/store-info";

function settings(values: Record<string, string | null> = {}): AdminSettings {
  return { settings: values, business_hours: [], closed_days: [], protection_thresholds: {} } as unknown as AdminSettings;
}

const blank = (): StoreInfoForm => ({ ...toStoreInfoForm(settings()), return_window_days: "14" });

describe("store info form", () => {
  it("loads every field, null as empty", () => {
    const form = toStoreInfoForm(settings({ support_phone: "+9647701112233", store_legal_name_ar: null, return_window_days: "14" }));
    expect(Object.keys(form).sort()).toEqual([...STORE_INFO_KEYS].sort());
    expect(form.support_phone).toBe("+9647701112233");
    expect(form.store_legal_name_ar).toBe("");
    expect(form.return_window_days).toBe("14");
  });

  it("accepts an empty form apart from the return window", () => {
    expect(validateStoreInfo(blank())).toEqual({});
    expect(validateStoreInfo({ ...blank(), return_window_days: "" })).toEqual({ return_window_days: "required" });
  });

  it("checks each field the way the API does", () => {
    expect(
      validateStoreInfo({
        ...blank(),
        store_legal_name_ar: "ا".repeat(161),
        support_phone: "12345",
        support_email: "not-an-email",
        return_window_days: "0",
        refund_days: "-2",
        policy_effective_date: "2026-02-30",
      }),
    ).toEqual({
      store_legal_name_ar: "maxLength",
      support_phone: "phone",
      support_email: "email",
      return_window_days: "positiveInteger",
      refund_days: "nonNegativeInteger",
      policy_effective_date: "date",
    });
  });

  it("stores phones in E.164 and numbers in Latin digits, as people type them", () => {
    expect(storedValue("support_phone", "0770 111 2233")).toBe("+9647701112233");
    expect(storedValue("support_whatsapp", "٠٧٧٠١١١٢٢٤٤")).toBe("+9647701112244");
    expect(storedValue("return_window_days", "١٤")).toBe("14");
    expect(storedValue("store_address_ar", "  بغداد  ")).toBe("بغداد");
    expect(validateStoreInfo({ ...blank(), support_phone: "0770 111 2233", refund_days: "٠" })).toEqual({});
  });

  it("sends only what changed, and an emptied field as null", () => {
    const before = { ...blank(), support_email: "help@shubayr.com", support_phone: "+9647701112233" };
    expect(storeInfoPatch(before, before)).toBeNull();
    expect(
      storeInfoPatch(before, { ...before, support_email: "", support_phone: "07701112233", store_legal_name_en: " Shubayr Trading " }),
    ).toEqual({ settings: { support_email: null, store_legal_name_en: "Shubayr Trading" } });
  });

  it("maps the API's field errors back to their fields by code", () => {
    const error = new ApiError(422, "Validation failed", "VALIDATION_FAILED", [
      { field: "settings.support_phone", code: "e164", message: "…" },
      { field: "settings.store_address_en", code: "not_empty", message: "…" },
      { field: "settings.refund_days", code: "non_negative_integer", message: "…" },
      { field: "settings.policy_effective_date", code: "date", message: "…" },
      { field: "settings.privacy_email", code: "something_new", message: "…" },
      { field: "settings.timezone", code: "iana_timezone", message: "…" },
    ]);
    expect(storeInfoApiProblems(error)).toEqual({
      support_phone: "phone",
      store_address_en: "required",
      refund_days: "nonNegativeInteger",
      policy_effective_date: "date",
      privacy_email: "invalid",
    });
    expect(storeInfoApiProblems(new Error("x"))).toEqual({});
  });

  it("is part of Settings, so it is on in the launch configuration", () => {
    expect(isRouteEnabled("/settings/store-info", parseModules("catalog,stock,orders,settings,users"))).toBe(true);
  });
});

describe("store info messages", () => {
  for (const [locale, messages] of [["en", en], ["ar", ar]] as const) {
    it(`${locale}: every field and problem has words`, () => {
      const m = messages.storeInfo as unknown as Record<string, Record<string, string>>;
      for (const key of STORE_INFO_KEYS) expect(m.fields[key], `fields.${key}`).toBeTruthy();
      for (const problem of ["required", "maxLength", "phone", "email", "positiveInteger", "nonNegativeInteger", "date", "invalid"]) {
        expect(m.problems[problem], `problems.${problem}`).toBeTruthy();
      }
      expect((messages.settingsTabs as Record<string, string>).storeInfo).toBeTruthy();
    });
  }

  it("has the same keys in both languages", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      value && typeof value === "object"
        ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix.slice(0, -1)];
    expect(keys(ar.storeInfo).sort()).toEqual(keys(en.storeInfo).sort());
  });
});
