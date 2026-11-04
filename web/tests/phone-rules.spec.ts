import { expect, test } from "@playwright/test";
import { toE164 } from "../src/lib/api";
import {
  cleanOtpCode,
  cleanPhoneTyping,
  contactPhoneE164,
  foldDigits,
  iraqiMobile,
  iraqiMobileE164,
} from "../src/lib/phone";

/**
 * Iraqi phone numbers as people really enter them (PR W2) — pure rules, run
 * in Node: every accepted way to write one Asiacell number, the invisible
 * characters iOS autofill adds, Arabic-Indic and Persian digits, and what is
 * still refused.
 */

const NATIONAL = "07717281373";
const E164 = "+9647717281373";

// Written as escapes so the invisible characters are visible in review.
const LRE = "‪";
const RLE = "‫";
const PDF = "‬";
const LRO = "‭";
const RLO = "‮";
const LRM = "‎";
const RLM = "‏";
const LRI = "⁦";
const PDI = "⁩";
const FSI = "⁨";
const BOM = "﻿";
const NBSP = " ";
const NNBSP = " ";

const ACCEPTED: Array<[string, string]> = [
  ["national", "07717281373"],
  ["no trunk zero (10 digits)", "7717281373"],
  ["+964", "+9647717281373"],
  ["964 without +", "9647717281373"],
  ["00964", "009647717281373"],
  ["+964 with spaces", "+964 771 728 1373"],
  ["+964 with dashes", "+964-771-728-1373"],
  ["00964 with spaces", "00964 771 728 1373"],
  ["national grouped 4-3-4", "0771 728 1373"],
  ["national grouped 4-3-2-2", "0771 728 13 73"],
  ["national with dashes", "0771-728-1373"],
  ["national with dots", "0771.728.1373"],
  ["national with brackets", "(0771) 728 1373"],
  ["+964 (0) written in", "+964 (0) 771 728 1373"],
  ["leading and trailing spaces", "  07717281373  "],
  ["NBSP grouping", `0771${NBSP}728${NBSP}1373`],
  ["narrow NBSP grouping", `+964${NNBSP}771${NNBSP}728${NNBSP}1373`],
  ["LRE…PDF wrapped (iOS autofill)", `${LRE}+964 771 728 1373${PDF}`],
  ["RLE…PDF wrapped", `${RLE}07717281373${PDF}`],
  ["LRO / RLO wrapped", `${LRO}0771${RLO}7281373${PDF}${PDF}`],
  ["LRM before and inside", `${LRM}0771${LRM}7281373`],
  ["RLM inside", `0771${RLM}728${RLM}1373`],
  ["LRI…PDI / FSI isolates", `${LRI}${FSI}07717281373${PDI}${PDI}`],
  ["BOM in front", `${BOM}07717281373`],
  ["Arabic-Indic digits", "٠٧٧١٧٢٨١٣٧٣"],
  ["Persian digits", "۰۷۷۱۷۲۸۱۳۷۳"],
  ["Arabic-Indic, grouped", "٠٧٧١ ٧٢٨ ١٣٧٣"],
  ["Arabic-Indic +964", "+٩٦٤٧٧١٧٢٨١٣٧٣"],
  ["Persian 00964", "۰۰۹۶۴۷۷۱۷۲۸۱۳۷۳"],
  ["mixed Latin and Arabic-Indic", "07٧١٧2٨١٣7٣"],
  ["Arabic-Indic, bidi-wrapped, NBSP", `${LRE}${LRM}٠٧٧١${NBSP}٧٢٨${NBSP}١٣٧٣${PDF}`],
];

test.describe("accepted: every way of writing 07717281373", () => {
  for (const [name, typed] of ACCEPTED) {
    test(name, () => {
      expect(iraqiMobile(typed)).toBe(NATIONAL);
      expect(iraqiMobileE164(typed)).toBe(E164);
      // What the API receives from sign-in, checkout and the address book.
      expect(toE164(typed)).toBe(E164);
      expect(contactPhoneE164(typed)).toBe(E164);
    });
  }

  test("other Iraqi mobile prefixes: Zain 078/079, Korek 075, Asiacell 077", () => {
    for (const national of ["07801234567", "07901234567", "07501234567", "07701234567"]) {
      expect(iraqiMobile(national)).toBe(national);
      expect(iraqiMobile(`+964${national.slice(1)}`)).toBe(national);
    }
  });
});

const REFUSED: Array<[string, string]> = [
  ["empty", ""],
  ["only marks and spaces", `${LRE} ${PDF}${LRM}`],
  ["landline prefix 01", "01712345678"],
  ["wrong mobile prefix 08", "08717281373"],
  ["one digit short", "0771728137"],
  ["one digit long", "077172813730"],
  ["10 digits not starting 7", "1717281373"],
  ["+964 short", "+964771728137"],
  ["+964 long", "+96477172813734"],
  ["+964 landline", "+96417123456"],
  ["non-Iraqi: UK", "+447700900123"],
  ["non-Iraqi: Kazakhstan +7", "+77017281373"],
  ["non-Iraqi: 0044", "00447700900123"],
  ["letters", "0771abc1373"],
  ["two pluses", "++9647717281373"],
];

test.describe("refused: not an Iraqi mobile number", () => {
  for (const [name, typed] of REFUSED) {
    test(name, () => {
      expect(iraqiMobile(typed)).toBeNull();
      expect(iraqiMobileE164(typed)).toBeNull();
    });
  }

  test("bare digits are never given a country (7701234567 is never +7…)", () => {
    expect(toE164("7701234567")).toBe("+9647701234567");
    expect(contactPhoneE164("1717281373")).toBeNull();
    expect(toE164("1717281373")).not.toMatch(/^\+/);
  });
});

test.describe("address forms keep taking a number written internationally", () => {
  test("a valid E.164 number from abroad is kept as it was", () => {
    expect(contactPhoneE164("+44 7700 900123")).toBe("+447700900123");
    expect(contactPhoneE164("0044 7700 900123")).toBe("+447700900123");
    expect(contactPhoneE164(`${LRE}+44 7700 900123${PDF}`)).toBe("+447700900123");
  });

  test("but not one too short for E.164", () => {
    expect(contactPhoneE164("+4412")).toBeNull();
  });
});

test.describe("while typing", () => {
  test("digits are folded to Latin and invisible marks dropped; the customer's spacing stays", () => {
    expect(foldDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(foldDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    expect(cleanPhoneTyping(`${LRE}٠٧٧١ ٧٢٨-١٣٧٣${PDF}`)).toBe("0771 728-1373");
    expect(cleanPhoneTyping(`${BOM}${LRM}+964${RLM} 771`)).toBe("+964 771");
  });
});

test.describe("the OTP code", () => {
  test("Arabic and Persian digits are folded; marks, spaces and the rest dropped; six digits kept", () => {
    expect(cleanOtpCode("٤٥٦٤٢٣", 6)).toBe("456423");
    expect(cleanOtpCode("۴۵۶۴۲۳", 6)).toBe("456423");
    expect(cleanOtpCode(`${LRE}٤٥٦ ٤٢٣${PDF}`, 6)).toBe("456423");
    expect(cleanOtpCode("456-423", 6)).toBe("456423");
    expect(cleanOtpCode(`${LRM}1${RLM}2${BOM}3456789`, 6)).toBe("123456");
    expect(cleanOtpCode("abc", 6)).toBe("");
  });
});
