// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { components } from "@/types/api";
import { NAV_ITEMS, activeNavGroup, groupNav, visibleNav, type NavEntry } from "@/lib/nav";
import { homePeriodHref, resolveHomePeriod } from "@/lib/home-period";
import { MODULES } from "@/lib/modules";
import { renderIn } from "./render";

const navigation = vi.hoisted(() => ({
  pathname: "/",
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push, replace: navigation.replace, refresh: navigation.refresh }),
}));
const hardNavigate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hard-navigate", () => ({ hardNavigate }));
vi.mock("@/components/inbox/notification-bell", () => ({ NotificationBell: () => null }));

const { AdminShell } = await import("@/components/shell/admin-shell");
const { PeriodSelector } = await import("@/components/home/period-selector");
const { LoginForm } = await import("@/app/login/login-form");

type User = components["schemas"]["User"];
const ALL = [...new Set(NAV_ITEMS.flatMap((item) => [...item.requires, ...(item.requiresAny ?? [])]))];

function user(permissions: string[] = ALL): User {
  return {
    id: "u1",
    name: "Hiba Owner",
    phone: null,
    username: "owner",
    email: null,
    is_active: true,
    role: null,
    permissions,
    surface: "admin",
    client: null,
    must_change_password: false,
    permission_version: 1,
    created_at: "2026-10-01T00:00:00Z",
  } as User;
}

function keys(entries: NavEntry[]): string[] {
  return entries.map((entry) => (entry.kind === "link" ? entry.item.key : `group:${entry.key}`));
}

beforeEach(() => {
  navigation.pathname = "/";
  navigation.push.mockReset();
  hardNavigate.mockReset();
  window.localStorage.clear();
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  // The shell re-reads the session on focus; answer with the same user.
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL) =>
    String(url) === "/api/auth/session"
      ? new Response(JSON.stringify(user()), { status: 200 })
      : new Response("{}", { status: 200 }),
  ) as typeof fetch;
});

/* -------------------------------------------------------------- grouping */
describe("grouped navigation (VIS-002)", () => {
  it("puts Home first, Reports last and every other page in its group", () => {
    const entries = groupNav(visibleNav(ALL));
    expect(keys(entries)).toEqual([
      "dashboard",
      "group:catalog",
      "group:ordersDelivery",
      "group:inventory",
      "group:purchasing",
      "group:finance",
      "group:store",
      "group:users",
      "reports",
    ]);
    const grouped = entries.flatMap((entry) => (entry.kind === "group" ? entry.items.map((item) => item.key) : []));
    // Every page appears once, in a group or as a direct link.
    expect([...grouped, "dashboard", "reports"].sort()).toEqual(NAV_ITEMS.map((item) => item.key).sort());
  });

  it("hides a group the permissions empty, and keeps a partly visible one", () => {
    // catalog.products opens Products, and Banners in the store group.
    const entries = groupNav(visibleNav(["catalog.products"]));
    expect(keys(entries)).toEqual(["dashboard", "group:catalog", "group:store"]);
    const items = (key: string) => entries.flatMap((entry) => (entry.kind === "group" && entry.key === key ? entry.items.map((item) => item.key) : []));
    expect(items("catalog")).toEqual(["products"]);
    expect(items("store")).toEqual(["banners"]);
  });

  it("hides a group the modules switch off entirely", () => {
    const entries = groupNav(visibleNav(ALL, undefined, []));
    for (const entry of entries) if (entry.kind === "group") expect(entry.items.length).toBeGreaterThan(0);
    expect(keys(entries)).not.toContain("trips");
  });

  it("finds the group of the current page", () => {
    const entries = groupNav(visibleNav(ALL));
    expect(activeNavGroup(entries, "warehouses")).toBe("inventory");
    expect(activeNavGroup(entries, "staff")).toBe("users");
    expect(activeNavGroup(entries, "dashboard")).toBeNull();
    expect(activeNavGroup(entries, null)).toBeNull();
  });
});

/* -------------------------------------------------------------- shell */
function renderShell(locale: "ar" | "en" = "ar", permissions?: string[]) {
  return renderIn(
    locale,
    <AdminShell initialUser={user(permissions)} modules={MODULES} version="v1.4.0">
      <p>content</p>
    </AdminShell>,
  );
}

describe("sidebar (VIS-002)", () => {
  it("opens the current page's group and remembers groups opened by hand", async () => {
    const u = userEvent.setup();
    navigation.pathname = "/inventory/warehouses";
    const { unmount } = renderShell();
    const nav = screen.getByTestId("sidebar-nav");
    expect(within(nav).getByTestId("nav-group-inventory").getAttribute("aria-expanded")).toBe("true");
    expect(within(nav).getByTestId("nav-warehouses").getAttribute("aria-current")).toBe("page");
    const finance = within(nav).getByTestId("nav-group-finance");
    expect(finance.getAttribute("aria-expanded")).toBe("false");
    expect(within(nav).getByTestId("nav-expenses").closest("ul")?.hidden).toBe(true);

    await u.click(finance);
    expect(finance.getAttribute("aria-expanded")).toBe("true");
    expect(window.localStorage.getItem("shubayr.admin.nav.open")).toBe('["finance"]');
    unmount();

    renderShell();
    expect(within(screen.getByTestId("sidebar-nav")).getByTestId("nav-group-finance").getAttribute("aria-expanded")).toBe("true");
  });

  it("lets the current group be collapsed", async () => {
    const u = userEvent.setup();
    navigation.pathname = "/staff";
    renderShell();
    const users = within(screen.getByTestId("sidebar-nav")).getByTestId("nav-group-users");
    expect(users.getAttribute("aria-expanded")).toBe("true");
    await u.click(users);
    expect(users.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows the version in the sidebar footer", () => {
    renderShell("en");
    expect(within(screen.getByTestId("sidebar-footer")).getByTestId("app-version").textContent).toBe("Version v1.4.0");
  });

  it("has no language switch in the top bar", () => {
    renderShell();
    expect(within(screen.getByTestId("top-bar")).queryByTestId("locale-switch")).toBeNull();
  });
});

describe("drawer (VIS-002)", () => {
  it.each(["ar", "en"] as const)("opens over the page in %s and closes with Escape, the close button and a link", async (locale) => {
    const u = userEvent.setup();
    renderShell(locale);
    const open = screen.getByTestId("drawer-open");
    expect(screen.queryByTestId("nav-drawer")).toBeNull();

    await u.click(open);
    const drawer = await screen.findByTestId("nav-drawer");
    expect(drawer.getAttribute("dir")).toBe(locale === "ar" ? "rtl" : "ltr");
    expect(drawer.getAttribute("role")).toBe("dialog");
    expect(screen.getByTestId("drawer-backdrop")).toBeTruthy();
    await u.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("nav-drawer")).toBeNull());

    await u.click(open);
    await u.click(await screen.findByTestId("drawer-close"));
    await waitFor(() => expect(screen.queryByTestId("nav-drawer")).toBeNull());

    await u.click(open);
    await u.click(within(await screen.findByTestId("drawer-nav")).getByTestId("nav-reports"));
    await waitFor(() => expect(screen.queryByTestId("nav-drawer")).toBeNull());
  });
});

/* -------------------------------------------------------------- account menu */
describe("account menu and sign-out (VIS-004)", () => {
  async function openMenu() {
    const u = userEvent.setup();
    await u.click(screen.getByTestId("account-menu"));
    return { u, menu: await screen.findByTestId("account-menu-content") };
  }

  it("holds the name, the language, change password and sign out", async () => {
    renderShell();
    const { menu } = await openMenu();
    expect(within(menu).getByTestId("account-name").textContent).toBe("Hiba Owner");
    expect(within(menu).getByTestId("account-locale-ar").getAttribute("aria-checked")).toBe("true");
    expect(within(menu).getByTestId("account-locale-en").getAttribute("aria-checked")).toBe("false");
    expect(within(menu).getByTestId("account-change-password").getAttribute("href")).toBe("/change-password");
    expect(within(menu).getByTestId("sign-out")).toBeTruthy();
  });

  it("switches the language through the existing preference", async () => {
    renderShell();
    const { u, menu } = await openMenu();
    await u.click(within(menu).getByTestId("account-locale-en"));
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/locale", expect.objectContaining({ method: "POST" })),
    );
  });

  it("asks before signing out; Cancel keeps the session", async () => {
    renderShell();
    const { u, menu } = await openMenu();
    await u.click(within(menu).getByTestId("sign-out"));
    const dialog = await screen.findByTestId("confirm-dialog");
    expect(dialog.textContent).toContain("تسجيل الخروج");
    expect(dialog.textContent).toContain("هل تريد تسجيل الخروج من حسابك؟");
    await u.click(within(dialog).getByTestId("confirm-cancel"));
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).toBeNull());
    expect(globalThis.fetch).not.toHaveBeenCalledWith("/api/auth/logout", expect.anything());
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it("Escape keeps the session too", async () => {
    renderShell("en");
    const { u, menu } = await openMenu();
    await u.click(within(menu).getByTestId("sign-out"));
    expect((await screen.findByTestId("confirm-dialog")).textContent).toContain("Do you want to sign out of your account?");
    await u.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).toBeNull());
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it("signs out on confirm and goes to sign-in", async () => {
    renderShell();
    const { u, menu } = await openMenu();
    await u.click(within(menu).getByTestId("sign-out"));
    await u.click(within(await screen.findByTestId("confirm-dialog")).getByTestId("confirm-submit"));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith("/login"));
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
  });
});

/* -------------------------------------------------------------- period */
describe("home period (VIS-003)", () => {
  const day = "2026-10-24";

  it("reads today, this month and a custom range from the URL", () => {
    expect(resolveHomePeriod({}, day)).toEqual({ kind: "today", from: day, to: day });
    expect(resolveHomePeriod({ period: "month" }, day)).toEqual({ kind: "month", from: "2026-10-01", to: day });
    expect(resolveHomePeriod({ period: "custom", from: "2026-09-01", to: "2026-09-30" }, day)).toEqual({
      kind: "custom",
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it.each([
    [{ period: "week" }],
    [{ period: "custom", from: "2026-09-30", to: "2026-09-01" }],
    [{ period: "custom", from: "2026-10-01", to: "2026-10-25" }],
    [{ period: "custom", from: "2026-02-30", to: "2026-03-01" }],
    [{ period: "custom", from: "yesterday", to: day }],
  ])("falls back to today for %j", (query) => {
    expect(resolveHomePeriod(query, day).kind).toBe("today");
  });

  it("round-trips through its URL", () => {
    for (const query of [{}, { period: "month" }, { period: "custom", from: "2026-09-01", to: "2026-09-30" }]) {
      const period = resolveHomePeriod(query, day);
      const params = Object.fromEntries(new URL(homePeriodHref(period), "http://x").searchParams);
      expect(resolveHomePeriod(params, day)).toEqual(period);
    }
  });

  it("is one selector: Today, This month, or a custom range", async () => {
    const u = userEvent.setup();
    renderIn("en", <PeriodSelector period={resolveHomePeriod({}, day)} today={day} />);
    expect(screen.getByTestId("period-today").getAttribute("aria-pressed")).toBe("true");
    await u.click(screen.getByTestId("period-month"));
    expect(navigation.push).toHaveBeenLastCalledWith("/?period=month", { scroll: false });

    await u.click(screen.getByTestId("period-custom"));
    expect(screen.getByTestId("period-custom").getAttribute("aria-pressed")).toBe("true");
    const from = screen.getByTestId("period-from") as HTMLInputElement;
    const to = screen.getByTestId("period-to") as HTMLInputElement;
    await u.clear(from);
    await u.type(from, "2026-10-20");
    await u.clear(to);
    await u.type(to, "2026-10-10");
    // A reversed range is not applied.
    expect((screen.getByTestId("period-apply") as HTMLButtonElement).disabled).toBe(true);
    await u.clear(to);
    await u.type(to, "2026-10-22");
    await u.click(screen.getByTestId("period-apply"));
    expect(navigation.push).toHaveBeenLastCalledWith("/?period=custom&from=2026-10-20&to=2026-10-22", { scroll: false });

    await u.click(screen.getByTestId("period-today"));
    expect(navigation.push).toHaveBeenLastCalledWith("/", { scroll: false });
  });
});

/* -------------------------------------------------------------- login */
describe("sign-in copy (VIS-001)", () => {
  function respond(status: number, body: unknown) {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
    ) as typeof fetch;
  }

  async function signIn(locale: "ar" | "en", username: string, password: string) {
    const u = userEvent.setup();
    renderIn(locale, <LoginForm next="/" expired={false} />);
    if (username) await u.type(screen.getByTestId("login-username"), username);
    if (password) await u.type(screen.getByTestId("login-password"), password);
    await u.click(screen.getByTestId("login-submit"));
    return u;
  }

  it("names each empty field, and sends nothing", async () => {
    respond(201, {});
    await signIn("ar", "", "");
    expect(screen.getByTestId("error-username").textContent).toBe("أدخل اسم المستخدم.");
    expect(screen.getByTestId("error-password").textContent).toBe("أدخل كلمة المرور.");
    // Both messages belong to their inputs, the password behind its toggle too.
    for (const name of ["username", "password"]) {
      const input = screen.getByTestId(`login-${name}`);
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(input.getAttribute("aria-describedby")).toBe(screen.getByTestId(`error-${name}`).id);
    }
    expect(screen.getByLabelText("كلمة المرور")).toBe(screen.getByTestId("login-password"));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("names only the empty one", async () => {
    respond(201, {});
    await signIn("en", "owner", "");
    expect(screen.queryByTestId("error-username")).toBeNull();
    expect(screen.getByTestId("error-password").textContent).toBe("Enter your password.");
  });

  it.each([
    [401, { code: "INVALID_CREDENTIALS", message: "Invalid credentials" }],
    // Sign-in applies no length or format rules: a 422 is the same answer.
    [422, { code: "VALIDATION_ERROR", message: "Invalid", errors: [{ field: "password", message: "Too short" }] }],
  ])("a %i is the one wrong-pair message, with no field rules", async (status, body) => {
    respond(status, body);
    await signIn("ar", "x", "y");
    expect((await screen.findByTestId("login-error")).textContent).toBe("اسم المستخدم أو كلمة المرور غير صحيحة.");
    expect(screen.queryByTestId("error-password")).toBeNull();
    expect(screen.queryByTestId("error-username")).toBeNull();
  });

  it("tells a connection failure apart", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    await signIn("en", "owner", "secret");
    expect((await screen.findByTestId("login-connection-error")).textContent).toBe("Unable to connect. Please try again.");
    expect(screen.queryByTestId("login-error")).toBeNull();
  });

  it("calls an unreachable API a connection failure", async () => {
    respond(503, { code: "API_UNAVAILABLE", message: "down" });
    await signIn("ar", "owner", "secret");
    expect((await screen.findByTestId("login-connection-error")).textContent).toBe("تعذّر الاتصال. حاول مرة أخرى.");
  });

  it("shows and hides the password", async () => {
    const u = userEvent.setup();
    renderIn("en", <LoginForm next="/" expired={false} />);
    const input = screen.getByTestId("login-password");
    const toggle = screen.getByTestId("login-password-toggle");
    expect(input.getAttribute("type")).toBe("password");
    await u.click(toggle);
    expect(input.getAttribute("type")).toBe("text");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    await u.click(toggle);
    expect(input.getAttribute("type")).toBe("password");
  });
});
