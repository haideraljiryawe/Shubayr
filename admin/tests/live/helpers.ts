import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

/**
 * Shared plumbing for the admin's live suite.
 *
 * The browser drives the admin; the API is called directly only to SET UP a
 * scenario (a throwaway staff account, a password already changed) or to
 * VERIFY an outcome the UI cannot show (a phone's OTP role). Every account a
 * test creates is unique to the run, so the suite can run repeatedly against
 * the same database.
 */

export const API = process.env.ADMIN_LIVE_API ?? "http://localhost:8000/api/v1";
export const DEV_OTP = process.env.DEV_OTP ?? "000000";

/** The seeded administrator (backend/prisma/seed.ts — development only). */
export const ADMIN_USERNAME = process.env.LIVE_ADMIN_USERNAME ?? "admin";
export const ADMIN_PASSWORD =
  process.env.LIVE_ADMIN_PASSWORD ?? "Shubayr-Dev-Admin!2026";

/** A password that satisfies the policy, for accounts the tests activate. */
export const KNOWN_PASSWORD = "Live-Test-Pass!2026";

export function unique(prefix: string): string {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `${prefix}.${stamp}${random}`;
}

/** A random Iraqi mobile number that no seed or customer uses. */
export function randomWorkPhone(): string {
  const digits = Array.from({ length: 7 }, () =>
    Math.floor(Math.random() * 10),
  ).join("");
  return `+964789${digits}`;
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * The gate every live spec opens with: under playwright.live.config.ts an
 * unreachable API fails the run. Any HTTP status — a 429 included — means the
 * API is there.
 */
export async function requireLiveApi(
  request: APIRequestContext,
): Promise<void> {
  let up = true;
  try {
    await request.get(`${API}/settings`, { timeout: 5_000 });
  } catch {
    up = false;
  }
  if (!up && process.env.ADMIN_LIVE_REQUIRED === "1") {
    throw new Error(`No API at ${API}, but the admin live suite requires one.`);
  }
  test.skip(!up, `No API at ${API}.`);
}

/** Wait out the API's rate-limit window when a probe says it is exhausted. */
export async function awaitQuota(request: APIRequestContext): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request.get(`${API}/settings`, { timeout: 5_000 });
    if (response.status() !== 429) return;
    const retryAfter = Number(response.headers()["retry-after"] ?? "5");
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        (Number.isFinite(retryAfter) ? Math.min(retryAfter, 60) : 5) * 1000 +
          500,
      ),
    );
  }
}

/** POST /admin/auth/login, retried once behind the rate limit. */
export async function apiLogin(
  request: APIRequestContext,
  username: string,
  password: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  let response = await request.post(`${API}/admin/auth/login`, {
    data: { username, password },
  });
  if (
    response.status() === 429 &&
    (await response.json()).code !== "ACCOUNT_LOCKED"
  ) {
    await awaitQuota(request);
    response = await request.post(`${API}/admin/auth/login`, {
      data: { username, password },
    });
  }
  return { status: response.status(), body: await response.json() };
}

let adminToken: string | null = null;

export async function adminApiToken(
  request: APIRequestContext,
): Promise<string> {
  if (adminToken) return adminToken;
  const { status, body } = await apiLogin(
    request,
    ADMIN_USERNAME,
    ADMIN_PASSWORD,
  );
  expect(status, "seeded admin login").toBe(201);
  adminToken = body.access_token as string;
  return adminToken;
}

export interface Preset {
  id: string;
  name: string;
}

export async function presetByName(
  request: APIRequestContext,
  name: string,
): Promise<Preset> {
  const response = await request.get(`${API}/admin/presets`, {
    headers: bearer(await adminApiToken(request)),
  });
  expect(response.ok()).toBe(true);
  const preset = ((await response.json()) as Preset[]).find(
    (row) => row.name === name,
  );
  expect(preset, `seeded preset ${name}`).toBeTruthy();
  return preset!;
}

export interface CreatedStaff {
  id: string;
  username: string;
  password: string;
}

/** Create a staff account through the API, with a temporary password. */
export async function createStaff(
  request: APIRequestContext,
  options: {
    presets?: string[];
    permissionKeys?: string[];
    prefix?: string;
  } = {},
): Promise<CreatedStaff> {
  const presetIds = [];
  for (const name of options.presets ?? [])
    presetIds.push((await presetByName(request, name)).id);
  const username = unique(options.prefix ?? "live");
  const password = "Temp-Pass!" + Math.random().toString(36).slice(2, 8) + "A1";
  const response = await request.post(`${API}/admin/staff`, {
    headers: bearer(await adminApiToken(request)),
    data: {
      username,
      name: `Live ${username}`,
      password,
      preset_ids: presetIds,
      permission_keys: options.permissionKeys ?? [],
      reason: "Admin live test setup",
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const created = (await response.json()) as { id: string };
  return { id: created.id, username, password };
}

/** Replace the temporary password through the API, so the UI can sign in directly. */
export async function activateStaff(
  request: APIRequestContext,
  staff: CreatedStaff,
): Promise<CreatedStaff> {
  const { status, body } = await apiLogin(
    request,
    staff.username,
    staff.password,
  );
  expect(status).toBe(201);
  const changed = await request.post(`${API}/admin/auth/change-password`, {
    headers: bearer(body.access_token as string),
    data: { current_password: staff.password, new_password: KNOWN_PASSWORD },
  });
  expect(changed.status(), await changed.text()).toBe(201);
  return { ...staff, password: KNOWN_PASSWORD };
}

export async function setAccess(
  request: APIRequestContext,
  staffId: string,
  presets: string[],
  permissionKeys: string[],
): Promise<void> {
  const presetIds = [];
  for (const name of presets)
    presetIds.push((await presetByName(request, name)).id);
  const response = await request.put(`${API}/admin/staff/${staffId}/access`, {
    headers: bearer(await adminApiToken(request)),
    data: {
      preset_ids: presetIds,
      permission_keys: permissionKeys,
      reason: "Admin live test access change",
    },
  });
  expect(response.status(), await response.text()).toBe(200);
}

/**
 * Sign in through the admin's own form.
 *
 * The API allows 30 sign-in attempts a minute from one address, and every
 * attempt in this suite comes from the same one, so a rate-limit answer is
 * waited out (per its Retry-After) and the attempt repeated. A lockout is NOT
 * retried — that is an outcome the tests assert.
 */
export async function uiLogin(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto("/login");
    await page.getByTestId("login-username").fill(username);
    await page.getByTestId("login-password").fill(password);
    const [response] = await Promise.all([
      page.waitForResponse((candidate) =>
        candidate.url().endsWith("/api/auth/login"),
      ),
      page.getByTestId("login-submit").click(),
    ]);
    if (response.status() !== 429) return;
    const body = (await response.json().catch(() => ({}))) as { code?: string };
    if (body.code === "ACCOUNT_LOCKED") return;
    const seconds = Number(response.headers()["retry-after"] ?? "20");
    await page.waitForTimeout(
      (Number.isFinite(seconds) ? Math.min(seconds, 60) : 20) * 1000 + 500,
    );
  }
}

export async function uiLoginAsAdmin(page: Page): Promise<void> {
  await uiLogin(page, ADMIN_USERNAME, ADMIN_PASSWORD);
  await expect(page.getByTestId("dashboard")).toBeVisible();
}
