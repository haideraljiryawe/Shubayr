import { expect, test } from "@playwright/test";
import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  awaitQuota,
  requireLiveApi,
  uiLoginAsAdmin,
} from "./helpers";

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

test("the BFF refuses cross-origin writes and never proxies token routes", async ({
  page,
}) => {
  await uiLoginAsAdmin(page);

  // Same cookies, foreign Origin: refused before it reaches the API.
  const foreign = await page.request.post("/api/proxy/admin/presets", {
    headers: { Origin: "https://evil.example" },
    data: {
      name: "never_created",
      permission_keys: [],
      reason: "csrf attempt",
    },
  });
  expect(foreign.status()).toBe(403);
  expect((await foreign.json()).code).toBe("CSRF_ORIGIN_MISMATCH");

  // Token-minting routes are not reachable through the generic proxy.
  const login = await page.request.post("/api/proxy/admin/auth/login", {
    headers: { Origin: "http://localhost:3300" },
    data: { username: "admin", password: "x" },
  });
  expect(login.status()).toBe(404);
  const refresh = await page.request.post("/api/proxy/auth/refresh", {
    headers: { Origin: "http://localhost:3300" },
    data: { refresh_token: "x" },
  });
  expect(refresh.status()).toBe(404);

  // The session endpoint returns the profile, never a token.
  const session = await page.request.get("/api/auth/session");
  expect(session.ok()).toBe(true);
  const body = await session.text();
  expect(body).toContain('"surface":"admin"');
  expect(body).not.toContain("access_token");
  expect(body).not.toContain("refresh_token");
});

test("the login response carries the user, never the token pair", async ({
  page,
  request,
}) => {
  await awaitQuota(request);
  const response = await page.request.post("/api/auth/login", {
    headers: { Origin: "http://localhost:3300" },
    data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });
  expect(response.status()).toBe(200);
  const setCookies = response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value);
  expect(setCookies.length).toBeGreaterThanOrEqual(2);
  for (const cookie of setCookies.filter((value) =>
    value.startsWith("shubayr_admin_"),
  )) {
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Secure/i);
  }
  const body = await response.text();
  expect(body).toContain('"username":"admin"');
  expect(body).not.toContain("access_token");
  expect(body).not.toContain("refresh_token");
});
