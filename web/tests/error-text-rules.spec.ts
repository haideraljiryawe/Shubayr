import { expect, test } from "@playwright/test";
import ar from "../src/messages/ar.json";
import en from "../src/messages/en.json";
import { ApiError } from "../src/lib/api";
import { apiErrorText, type ApiErrorTranslator } from "../src/lib/error-text";

/**
 * What a shopper reads when a request fails (NOTE-012) — pure rules, run in
 * Node: the code's message in the page's language, a localized fallback for
 * unknown codes and transport failures, and never the API's English text.
 */

function translator(messages: Record<string, string>): ApiErrorTranslator {
  const t = ((key: string) => {
    if (!(key in messages)) throw new Error(`missing apiErrors.${key}`);
    return messages[key];
  }) as ApiErrorTranslator;
  t.has = (key: string) => key in messages;
  return t;
}

const SERVER_TEXT = "Return quantity exceeds the delivered quantity (internal: line 42)";

for (const [locale, messages] of [["ar", ar], ["en", en]] as const) {
  const all = messages.apiErrors as Record<string, string>;
  const t = translator(all);

  test(`${locale}: a documented code is worded in the page's language`, () => {
    const code = Object.keys(all).find((key) => !key.startsWith("_"))!;
    const text = apiErrorText(t, new ApiError(409, SERVER_TEXT, code));
    expect(text).toBe(all[code]);
    expect(text).not.toContain("internal");
  });

  test(`${locale}: unknown codes, 429, network and plain errors get a localized fallback`, () => {
    expect(apiErrorText(t, new ApiError(409, SERVER_TEXT, "NOT_A_REAL_CODE"))).toBe(all._fallback);
    expect(apiErrorText(t, new ApiError(409, SERVER_TEXT, "NOT_A_REAL_CODE"), "own fallback")).toBe("own fallback");
    expect(apiErrorText(t, new ApiError(429, SERVER_TEXT))).toBe(all._rateLimited);
    expect(apiErrorText(t, new ApiError(0, SERVER_TEXT))).toBe(all._network);
    expect(apiErrorText(t, new TypeError("Failed to fetch"))).toBe(all._network);
    expect(apiErrorText(t, new Error(SERVER_TEXT))).toBe(all._fallback);
    expect(apiErrorText(t, "<html>bad gateway</html>")).toBe(all._fallback);
  });
}

test("both languages word the same API error codes", () => {
  expect(Object.keys(ar.apiErrors).sort()).toEqual(Object.keys(en.apiErrors).sort());
  for (const [locale, messages] of [["ar", ar], ["en", en]] as const) {
    for (const [key, value] of Object.entries(messages.apiErrors)) expect(value, `${locale} apiErrors.${key}`).toBeTruthy();
  }
});
