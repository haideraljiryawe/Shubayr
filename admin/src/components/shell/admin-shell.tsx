"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Smartphone,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { components } from "@/types/api";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { isNavActive, visibleNav, type NavKey } from "@/lib/nav";
import { LocaleSwitch } from "./locale-switch";
import { hardNavigate } from "@/lib/hard-navigate";

type User = components["schemas"]["User"];

type SessionResult =
  | { kind: "user"; user: User }
  | { kind: "signedOut" }
  | { kind: "passwordChange" }
  | { kind: "unavailable" };

/** GET /api/auth/session, sorted into what the shell does next. */
async function fetchSession(): Promise<SessionResult> {
  const response = await fetch("/api/auth/session", {
    cache: "no-store",
  }).catch(() => null);
  if (!response) return { kind: "unavailable" };
  if (response.status === 401) return { kind: "signedOut" };
  if (response.status === 403) {
    const body = (await response.json().catch(() => null)) as {
      code?: string;
    } | null;
    return body?.code === "PASSWORD_CHANGE_REQUIRED"
      ? { kind: "passwordChange" }
      : { kind: "unavailable" };
  }
  if (!response.ok) return { kind: "unavailable" };
  return { kind: "user", user: (await response.json()) as User };
}

const ICONS: Record<NavKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  staff: Users,
  presets: KeyRound,
  workPhones: Smartphone,
};

/**
 * Sidebar + top bar around every signed-in screen.
 *
 * The menu is derived from the staff member's permissions, and those are
 * re-read from GET /me (through /api/auth/session) on every navigation and
 * whenever the window regains focus. A grant or revocation made by someone
 * else therefore reaches the menu on the next click, without signing in
 * again; when the permission version moves, the server components are
 * refreshed too. The menu is only a convenience — every page still handles
 * the API's 403 on its own.
 */
export function AdminShell({
  initialUser,
  children,
}: {
  initialUser: User;
  children: ReactNode;
}) {
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const version = useRef(initialUser.permission_version);

  const applySession = useCallback(
    (session: SessionResult) => {
      switch (session.kind) {
        case "signedOut":
          hardNavigate(
            `/login?expired=1&next=${encodeURIComponent(window.location.pathname)}`,
          );
          return;
        case "passwordChange":
          router.replace("/change-password");
          return;
        case "user":
          setUser(session.user);
          if (session.user.permission_version !== version.current) {
            version.current = session.user.permission_version;
            router.refresh();
          }
          return;
        default:
          // Offline or a transient failure: keep the menu we have.
          return;
      }
    },
    [router],
  );

  useEffect(() => {
    let current = true;
    void fetchSession().then((session) => {
      // A slower response for a page already left must not win.
      if (current) applySession(session);
    });
    return () => {
      current = false;
    };
  }, [pathname, applySession]);

  useEffect(() => {
    const onFocus = () => void fetchSession().then(applySession);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [applySession]);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    hardNavigate("/login");
  }

  const items = visibleNav(user.permissions);

  const nav = (
    <nav aria-label={t("label")} data-testid="sidebar-nav">
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = ICONS[item.key];
          const active = isNavActive(item, pathname);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                onClick={() => setMenuOpen(false)}
                data-testid={`nav-${item.key}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors",
                  active
                    ? "bg-primary-dark text-on-primary"
                    : "text-text hover:bg-card",
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="hidden border-e border-border bg-surface lg:flex lg:flex-col lg:gap-6 lg:p-4">
        <Brand />
        {nav}
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur lg:px-8">
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-md hover:bg-card lg:hidden"
            aria-label={menuOpen ? t("closeMenu") : t("openMenu")}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <X className="size-5" aria-hidden />
            ) : (
              <Menu className="size-5" aria-hidden />
            )}
          </button>
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="ms-auto flex items-center gap-2">
            <div className="hidden text-end sm:block">
              <p className="text-sm font-semibold" data-testid="current-user">
                {user.name || user.username}
              </p>
              <p className="text-xs text-text-muted" dir="ltr">
                {user.username}
              </p>
            </div>
            <LocaleSwitch />
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              pending={signingOut}
              data-testid="sign-out"
            >
              <LogOut className="size-4 rtl:-scale-x-100" aria-hidden />
              <span className="hidden sm:inline">{tAuth("signOut")}</span>
            </Button>
          </div>
        </header>

        {menuOpen ? (
          <div className="border-b border-border bg-surface p-4 lg:hidden">
            {nav}
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function Brand() {
  const t = useTranslations("brand");
  return (
    <Link
      href="/"
      className="flex items-center gap-2 font-bold text-primary-dark"
    >
      <span className="inline-flex size-9 items-center justify-center rounded-md bg-primary-dark text-on-primary">
        ش
      </span>
      <span className="leading-tight">
        {t("name")}
        <span className="block text-xs font-semibold text-text-muted">
          {t("adminShort")}
        </span>
      </span>
    </Link>
  );
}
