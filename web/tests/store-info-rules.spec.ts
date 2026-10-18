import { expect, test } from "@playwright/test";
import { arabicDays, englishDays, legalDocument } from "../src/content/legal";
import {
  FEE_REFUND_REASONS,
  RETURN_REASON_CODES,
  isReturnReasonCode,
  mayRefundDeliveryFee,
  returnLineProblem,
} from "../src/lib/return-reasons";
import { EMPTY_STORE_INFO, hasContact, inLocale, storeInfoFrom, telLink, whatsappLink } from "../src/lib/store-info";

/**
 * The store's legal, contact and policy details from GET /settings (contract
 * 17.2) and the return reasons — pure rules, run in Node. A missing value is
 * never replaced by a placeholder.
 */

const FULL = {
  store_legal_name_ar: "شركة شبير",
  store_legal_name_en: "Shubayr Trading",
  store_address_ar: "بغداد، العراق",
  store_address_en: "Baghdad, Iraq",
  support_phone: "+9647701112233",
  support_whatsapp: "+9647701112244",
  support_email: "help@shubayr.test",
  privacy_email: "privacy@shubayr.test",
  support_hours_ar: "يوميًا",
  support_hours_en: "Daily",
  return_window_days: 14,
  refund_days: 5,
  policy_effective_date: "2026-10-17",
};

const text = (document: ReturnType<typeof legalDocument>) =>
  document.blocks.flatMap((block) => [block.heading, ...(block.paragraphs ?? []), ...(block.items ?? [])]).join(" | ");

const contactParagraph = (document: ReturnType<typeof legalDocument>) => document.blocks.at(-1)?.paragraphs?.[0];

test.describe("store info from the settings", () => {
  test("reads every field", () => {
    const info = storeInfoFrom(FULL);
    expect(info).toEqual({
      legalName: { ar: "شركة شبير", en: "Shubayr Trading" },
      address: { ar: "بغداد، العراق", en: "Baghdad, Iraq" },
      hours: { ar: "يوميًا", en: "Daily" },
      phone: "+9647701112233",
      whatsapp: "+9647701112244",
      email: "help@shubayr.test",
      privacyEmail: "privacy@shubayr.test",
      returnWindowDays: 14,
      refundDays: 5,
      policyDate: "2026-10-17",
    });
    expect(hasContact(info)).toBe(true);
  });

  test("null, missing, blank and malformed values all stay null", () => {
    for (const settings of [null, undefined, {}]) {
      expect(storeInfoFrom(settings)).toEqual(EMPTY_STORE_INFO);
    }
    const info = storeInfoFrom({
      store_legal_name_ar: "   ",
      store_address_en: null,
      support_phone: "07701112233",
      support_email: "not-an-email",
      return_window_days: 0,
      refund_days: -1,
      policy_effective_date: "17/10/2026",
    });
    expect(info.legalName.ar).toBeNull();
    expect(info.address.en).toBeNull();
    expect(info.phone).toBeNull();
    expect(info.email).toBeNull();
    expect(info.returnWindowDays).toBeNull();
    expect(info.refundDays).toBeNull();
    expect(info.policyDate).toBeNull();
    expect(hasContact(EMPTY_STORE_INFO)).toBe(false);
    // Refunds on the same day are a real value, not a missing one.
    expect(storeInfoFrom({ refund_days: 0 }).refundDays).toBe(0);
  });

  test("a bilingual value falls back to the other language, else null", () => {
    expect(inLocale({ ar: "عربي", en: null }, "en")).toBe("عربي");
    expect(inLocale({ ar: null, en: "English" }, "ar")).toBe("English");
    expect(inLocale({ ar: "عربي", en: "English" }, "en")).toBe("English");
    expect(inLocale({ ar: null, en: null }, "ar")).toBeNull();
  });

  test("links from E.164 numbers", () => {
    expect(telLink("+9647701112233")).toBe("tel:+9647701112233");
    expect(whatsappLink("+9647701112244")).toBe("https://wa.me/9647701112244");
  });
});

test.describe("policy texts", () => {
  const context = (settings: Record<string, unknown> | null) => ({
    storeName: "Shubayr",
    siteUrl: "https://shubayr.com",
    info: storeInfoFrom(settings),
  });

  test("the returns policy uses the API's return window and refund days", () => {
    expect(text(legalDocument("returns", "en", context(FULL)))).toContain("within 14 days of receiving it");
    expect(text(legalDocument("returns", "en", context(FULL)))).toContain("within 5 days, in cash");
    expect(text(legalDocument("returns", "ar", context(FULL)))).toContain("خلال 14 يومًا من استلامه");
    expect(text(legalDocument("returns", "ar", context(FULL)))).toContain("خلال 5 أيام نقدًا");
    expect(text(legalDocument("returns", "en", context({ ...FULL, refund_days: 0 })))).toContain("in cash the same day");
  });

  test("with nothing set: neutral sentences, no numbers, no placeholders", () => {
    for (const lang of ["ar", "en"] as const) {
      for (const page of ["privacy", "terms", "returns"] as const) {
        const body = text(legalDocument(page, lang, context(null)));
        expect(body, `${page}/${lang}`).not.toMatch(/\[|CHANGE_ME|undefined|null|NaN|\.example/);
        expect(body, `${page}/${lang}`).not.toContain("@");
      }
    }
    expect(text(legalDocument("returns", "en", context(null)))).toContain("within the return period the store sets");
    expect(text(legalDocument("returns", "en", context(null)))).toContain("we refund it in cash.");
    expect(text(legalDocument("returns", "en", context(null)))).toContain("reach us through the Contact us page");
    expect(text(legalDocument("privacy", "ar", context(null)))).toContain("صفحة «اتصل بنا»");
    // The store's display name stands in for an unknown legal name.
    expect(text(legalDocument("terms", "en", context(null)))).toContain("operated by Shubayr.");
  });

  test("contacts, legal name and address appear exactly when set", () => {
    const privacy = text(legalDocument("privacy", "en", context(FULL)));
    expect(privacy).toContain("Shubayr Trading, Baghdad, Iraq.");
    expect(privacy).toContain("privacy@shubayr.test");
    // Without a privacy address, the general support e-mail is the contact.
    expect(text(legalDocument("privacy", "en", context({ support_email: "help@shubayr.test" })))).toContain("help@shubayr.test");
    expect(contactParagraph(legalDocument("returns", "ar", context({ support_phone: "+9647701112233" })))).toBe("للمساعدة في الإرجاع: +9647701112233.");
    expect(contactParagraph(legalDocument("returns", "en", context(FULL)))).toBe("For help with a return: +9647701112233 or help@shubayr.test.");
  });

  test("Arabic and English day counts agree with their noun", () => {
    expect([1, 2, 3, 7, 10, 11, 14, 30].map(arabicDays)).toEqual(["يوم واحد", "يومين", "3 أيام", "7 أيام", "10 أيام", "11 يومًا", "14 يومًا", "30 يومًا"]);
    expect([1, 5].map(englishDays)).toEqual(["1 day", "5 days"]);
  });
});

test.describe("return reasons", () => {
  test("the picker offers exactly the reasons the API accepts", () => {
    expect([...RETURN_REASON_CODES].sort()).toEqual(["change_of_mind", "defect", "other", "store_error", "wrong_item"]);
    expect(isReturnReasonCode("defect")).toBe(true);
    expect(isReturnReasonCode("broken")).toBe(false);
  });

  test("a line needs a reason and the note the API requires", () => {
    expect(returnLineProblem({ reasonCode: "", note: "Cracked" })).toBe("reasonCode");
    expect(returnLineProblem({ reasonCode: "defect", note: "   " })).toBe("note");
    expect(returnLineProblem({ reasonCode: "defect", note: "Cracked" })).toBeNull();
  });

  test("defects, wrong items and store errors may bring the delivery fee back", () => {
    expect([...FEE_REFUND_REASONS].sort()).toEqual(["defect", "store_error", "wrong_item"]);
    expect(mayRefundDeliveryFee(["change_of_mind", "defect"])).toBe(true);
    expect(mayRefundDeliveryFee(["change_of_mind", "other", ""])).toBe(false);
  });
});
