import { describe, expect, it } from "vitest";
import {
  ApiError,
  errorKind,
  fieldErrorMap,
  toApiError,
} from "@/lib/api/errors";
import { NAV_ITEMS, isNavActive, visibleNav } from "@/lib/nav";
import {
  groupPermissions,
  keysFromPresets,
  presetKeys,
  toggleKey,
  type PermissionPreset,
} from "@/lib/permissions";
import { isE164, toE164 } from "@/lib/phone";
import {
  generateTemporaryPassword,
  isStrongPassword,
  passwordChecks,
} from "@/lib/password";
import { toWorkPhoneRow } from "@/lib/work-phones";

describe("visibleNav", () => {
  it("shows only what the current permissions open", () => {
    expect(visibleNav([]).map((item) => item.key)).toEqual(["dashboard"]);
    // Catalog v2: each catalog screen follows its own permission.
    expect(visibleNav(["catalog.products"]).map((item) => item.key)).toEqual([
      "dashboard",
      "products",
    ]);
    expect(
      visibleNav(["catalog.categories", "catalog.brands"]).map((item) => item.key),
    ).toEqual(["dashboard", "categories", "brands"]);
    expect(visibleNav(["users.manage"]).map((item) => item.key)).toEqual([
      "dashboard",
      "staff",
      "workPhones",
    ]);
    expect(visibleNav(["orders.view"]).map((item) => item.key)).toEqual([
      "dashboard",
      "orders",
    ]);
    // The finance screens follow their own permissions, independently.
    expect(visibleNav(["ledger.view"]).map((item) => item.key)).toEqual([
      "dashboard",
      "currencies",
      "periods",
      "ledger",
    ]);
    expect(visibleNav(["cash_accounts.manage", "settings.manage"]).map((item) => item.key)).toEqual([
      "dashboard",
      "cashAccounts",
      "settings",
    ]);
    expect(visibleNav(["audit.view"]).map((item) => item.key)).toEqual([
      "dashboard",
      "audit",
    ]);
    expect(
      visibleNav([
        "users.manage",
        "roles.manage",
        "orders.view",
        "catalog.products",
        "catalog.categories",
        "catalog.brands",
        "ledger.view",
        "cash_accounts.manage",
        "settings.manage",
        "audit.view",
        "inventory.view",
      ]),
    ).toHaveLength(NAV_ITEMS.length);
  });

  it("marks nested routes active, and the dashboard only at the root", () => {
    const staff = NAV_ITEMS.find((item) => item.key === "staff")!;
    const dashboard = NAV_ITEMS.find((item) => item.key === "dashboard")!;
    expect(isNavActive(staff, "/staff/abc")).toBe(true);
    expect(isNavActive(staff, "/staffing")).toBe(false);
    expect(isNavActive(dashboard, "/staff")).toBe(false);
    expect(isNavActive(dashboard, "/")).toBe(true);
  });
});

describe("API errors", () => {
  it("keeps the envelope's code and field errors", () => {
    const error = toApiError(422, {
      status: 422,
      code: "VALIDATION_FAILED",
      message: "Invalid",
      errors: [
        { field: "username", code: "matches", message: "bad username" },
        { field: "preset_ids.0", code: "isUuid", message: "bad preset" },
        { field: "username", code: "length", message: "second message loses" },
      ],
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(fieldErrorMap(error.errors)).toEqual({
      username: "bad username",
      preset_ids: "bad preset",
    });
  });

  it("survives a body that is not the envelope", () => {
    const error = toApiError(502, "<html>bad gateway</html>");
    expect(error.status).toBe(502);
    expect(error.code).toBeUndefined();
    expect(error.errors).toEqual([]);
  });

  it.each([
    [toApiError(429, { code: "ACCOUNT_LOCKED" }), "locked"],
    [toApiError(429, { code: "RATE_LIMITED" }), "rateLimited"],
    [toApiError(403, { code: "PASSWORD_CHANGE_REQUIRED" }), "passwordChange"],
    [toApiError(403, { code: "PERMISSION_DENIED" }), "forbidden"],
    [
      toApiError(409, { code: "CUSTOMER_PHONE_ALREADY_REGISTERED" }),
      "customerPhone",
    ],
    [toApiError(409, {}), "conflict"],
    [toApiError(401, {}), "unauthorized"],
    [toApiError(404, {}), "notFound"],
    [toApiError(422, {}), "validation"],
    [new Error("x"), "unknown"],
  ])("classifies %o as %s", (error, kind) => {
    expect(errorKind(error)).toBe(kind);
  });
});

describe("permissions", () => {
  const registry = [
    { key: "orders.view", group: "orders", description: "View orders" },
    { key: "users.manage", group: "access", description: null },
    { key: "orders.accept", group: "orders", description: "Accept" },
    { key: "roles.manage", group: "access" },
  ];
  const presets: PermissionPreset[] = [
    {
      id: "p1",
      name: "desk",
      description: null,
      is_system: false,
      created_at: "2026-09-29T00:00:00.000Z",
      updated_at: "2026-09-29T00:00:00.000Z",
      permissions: [
        { permission: { key: "orders.view" } },
        { permission: { key: "orders.accept" } },
      ],
    },
    {
      id: "p2",
      name: "empty",
      description: null,
      is_system: true,
      created_at: "2026-09-29T00:00:00.000Z",
      updated_at: "2026-09-29T00:00:00.000Z",
      permissions: [],
    },
  ];

  it("groups by area in registry order, keys sorted within", () => {
    expect(groupPermissions(registry)).toEqual([
      {
        group: "orders",
        permissions: [
          { key: "orders.accept", description: "Accept" },
          { key: "orders.view", description: "View orders" },
        ],
      },
      {
        group: "access",
        permissions: [
          { key: "roles.manage", description: null },
          { key: "users.manage", description: null },
        ],
      },
    ]);
  });

  it("reads the keys a preset grants and what a selection inherits", () => {
    expect(presetKeys(presets[0])).toEqual(["orders.view", "orders.accept"]);
    expect([...keysFromPresets(presets, ["p1", "p2"])].sort()).toEqual([
      "orders.accept",
      "orders.view",
    ]);
    expect(keysFromPresets(presets, []).size).toBe(0);
  });

  it("toggles keys without duplicates", () => {
    expect(toggleKey(["b"], "a", true)).toEqual(["a", "b"]);
    expect(toggleKey(["a", "b"], "a", true)).toEqual(["a", "b"]);
    expect(toggleKey(["a", "b"], "a", false)).toEqual(["b"]);
  });
});

describe("phones", () => {
  it.each([
    ["07701234567", "+9647701234567"],
    ["٠٧٧٠١٢٣٤٥٦٧", "+9647701234567"],
    ["0770 123 4567", "+9647701234567"],
    ["7701234567", "+9647701234567"],
    ["009647701234567", "+9647701234567"],
    ["+9647701234567", "+9647701234567"],
  ])("normalises %s", (input, e164) => {
    expect(toE164(input)).toBe(e164);
    expect(isE164(toE164(input))).toBe(true);
  });

  it("leaves nonsense for validation to reject", () => {
    expect(isE164(toE164("12"))).toBe(false);
  });

  it("reads a work phone's number from either shape", () => {
    const base = {
      id: "w",
      user_id: "u",
      name: "Ali",
      app_role: "delivery_agent" as const,
      is_active: true,
      created_at: "2026-09-29T00:00:00.000Z",
      updated_at: "2026-09-29T00:00:00.000Z",
    };
    expect(toWorkPhoneRow({ ...base, phone: "+9647700000005" }).phone).toBe(
      "+9647700000005",
    );
    expect(
      toWorkPhoneRow({ ...base, user: { phone: "+9647700000008" } }).phone,
    ).toBe("+9647700000008");
  });
});

describe("password policy", () => {
  it("mirrors the contract's rules", () => {
    expect(isStrongPassword("Shubayr-Dev-Admin!2026")).toBe(true);
    expect(passwordChecks("short1!A")).toMatchObject({
      length: false,
      lower: true,
      upper: true,
    });
    expect(isStrongPassword("alllowercase123!")).toBe(false);
    expect(isStrongPassword("NoSymbolsHere123")).toBe(false);
  });

  it("generates passwords that always satisfy it", () => {
    for (let run = 0; run < 200; run += 1) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(16);
      expect(isStrongPassword(password)).toBe(true);
    }
  });
});
