import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import {
  ApiError,
  FIELD_CODE_MESSAGES,
  describeError,
  describeFieldError,
  errorCode,
  fieldErrorMap,
  toApiError,
  type ErrorTranslator,
} from "@/lib/api/errors";

/**
 * NOTE-012: what the admin shows for a failure is the error code's message in
 * the person's language, or a localized fallback — never the API's English
 * message. A real translator over the real catalogs, so a missing key fails.
 */

type Tree = { [key: string]: string | Tree };

function translator(errors: Tree): ErrorTranslator {
  const lookup = (key: string) =>
    key.split(".").reduce<string | Tree | undefined>((node, part) => (node && typeof node === "object" ? node[part] : undefined), errors);
  const t = ((key: string) => {
    const value = lookup(key);
    if (typeof value !== "string") throw new Error(`missing errors.${key}`);
    return value;
  }) as ErrorTranslator;
  t.has = (key: string) => typeof lookup(key) === "string";
  return t;
}

const SERVER_TEXT = "Username must match /^[a-z0-9._-]+$/ (internal)";

for (const [locale, messages] of [["ar", ar], ["en", en]] as const) {
  const errors = messages.errors as unknown as Tree;
  const kinds = messages.errors as unknown as Record<string, string>;
  const codes = errors.codes as Record<string, string>;
  const fields = errors.fields as Record<string, string>;
  const t = translator(errors);
  const someCode = Object.keys(codes)[0];

  describe(`${locale}: code → message`, () => {
    it("maps class-validator constraints to field messages, not the API's text", () => {
      expect(describeFieldError(t, { code: "isNotEmpty" })).toBe(fields.required);
      expect(describeFieldError(t, { code: "maxLength" })).toBe(fields.tooLong);
      expect(describeFieldError(t, { code: "isInt" })).toBe(fields.wholeNumber);
      expect(describeFieldError(t, { code: "unheardOf" })).toBe(fields.invalid);
      expect(describeFieldError(t, { code: someCode })).toBe(codes[someCode]);
    });

    it("keys field errors by top-level field, first one wins", () => {
      const error = toApiError(422, {
        status: 422,
        code: "VALIDATION_FAILED",
        message: "Invalid",
        errors: [
          { field: "username", code: "matches", message: SERVER_TEXT },
          { field: "preset_ids.0", code: "isUUID", message: "bad preset" },
          { field: "username", code: "maxLength", message: "second message loses" },
        ],
      });
      const map = fieldErrorMap(error.errors, t);
      expect(map).toEqual({ username: fields.format, preset_ids: fields.format });
      expect(JSON.stringify(map)).not.toContain("internal");
    });

    it("describes a failure by its code, then by its kind", () => {
      expect(describeError(t, new ApiError(409, SERVER_TEXT, someCode))).toBe(codes[someCode]);
      expect(describeError(t, new ApiError(409, SERVER_TEXT, "NOT_A_REAL_CODE"))).toBe(kinds.conflict);
      expect(describeError(t, new ApiError(429, SERVER_TEXT))).toBe(kinds.rateLimited);
      expect(describeError(t, new TypeError("Failed to fetch"))).toBe(kinds.unknown);
      expect(describeError(t, new Error(SERVER_TEXT))).not.toContain("internal");
    });

    it("has a message for every field-message key the mapping uses", () => {
      for (const key of new Set(Object.values(FIELD_CODE_MESSAGES))) expect(fields[key], `errors.fields.${key}`).toBeTruthy();
      expect(fields.invalid).toBeTruthy();
    });
  });
}

describe("error catalogs", () => {
  it("word the same codes and fields in both languages", () => {
    expect(Object.keys(ar.errors.codes).sort()).toEqual(Object.keys(en.errors.codes).sort());
    expect(Object.keys(ar.errors.fields).sort()).toEqual(Object.keys(en.errors.fields).sort());
  });

  it("reads the code only from an ApiError", () => {
    expect(errorCode(new ApiError(409, "x", "SOME_CODE"))).toBe("SOME_CODE");
    expect(errorCode(new Error("x"))).toBeUndefined();
  });

  it("FormError words a code from the catalog and never renders the API's detail", () => {
    const source = readFileSync(join(__dirname, "../../src/components/forms/form-error.tsx"), "utf8");
    expect(source).toContain("codes.${code}");
    expect(source).not.toMatch(/\bdetail\b/);
  });
});
