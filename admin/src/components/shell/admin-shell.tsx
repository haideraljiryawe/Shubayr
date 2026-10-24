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
import { useLocale, useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import type { components } from "@/types/api";
import { Dialog } from "@/components/ui";
import { localeDirection, type Locale } from "@/i18n/config";
import { activeNavKey, groupNav, visibleNav, type NavEntry, type NavKey } from "@/lib/nav";
import type { ModuleKey } from "@/lib/modules";
import { NotificationBell } from "@/components/inbox/notification-bell";
import { AccountMenu } from "./account-menu";
import { AppVersion } from "./app-version";
import { OfficialSymbol } from "./official-symbol";
import { SidebarNav } from "./sidebar-nav";
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


/**
 * Sidebar + top bar around every signed-in screen (VIS-002, VIS-004).
 *
 * The top bar stays fixed above the content and the sidebar is its own
 * full-height column: the logo stays put, the menu scrolls inside itself
 * (reaching its end does not scroll the page), and the release version sits
 * in a footer below it. Below the wide breakpoint the sidebar becomes an
 * overlay drawer from the language's side.
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
  modules,
  version: appVersion,
  children,
}: {
  initialUser: User;
  /** The modules ADMIN_MODULES enables (src/lib/modules.ts). */
  modules: readonly ModuleKey[];
  /** The running release (APP_VERSION), shown in the sidebar footer. */
  version: string;
  children: ReactNode;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const version = useRef(initialUser.permission_version);
  const mountedPath = useRef(false);

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
    // A full page load already received a fresh user from the server. Skipping
    // this duplicate request also prevents a just-rendered action from being
    // replaced midway through a click; client-side navigations still refresh
    // permissions here, and focus changes are handled below.
    if (!mountedPath.current) {
      mountedPath.current = true;
      return;
    }
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

  const items = visibleNav(user.permissions, undefined, modules);
  const entries = groupNav(items);
  const current = activeNavKey(items, pathname);

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[17rem_1fr] print:block print:bg-white">
      <aside
        className="hidden border-e border-border bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col print:hidden"
        data-testid="sidebar"
      >
        <SidebarColumn entries={entries} active={current} version={appVersion} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header
          className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur lg:px-8 print:hidden"
          data-testid="top-bar"
        >
          <button
            type="button"
            className="inline-flex size-10 cursor-pointer items-center justify-center rounded-md hover:bg-card focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/40 lg:hidden"
            aria-label={t("openMenu")}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
            data-testid="drawer-open"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="ms-auto flex items-center gap-1">
            <NotificationBell />
            <AccountMenu name={user.name ?? ""} username={user.username} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8 print:max-w-none print:p-0">
          {children}
        </main>
      </div>

      <NavDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        entries={entries}
        active={current}
        version={appVersion}
      />
    </div>
  );
}

/** Logo on top, the menu scrolling on its own, the version at the bottom. */
function SidebarColumn({
  entries,
  active,
  version,
  onNavigate,
  testId,
}: {
  entries: readonly NavEntry[];
  active: NavKey | null;
  version: string;
  onNavigate?: () => void;
  testId?: string;
}) {
  return (
    <>
      <div className="shrink-0 border-b border-border px-4 py-4">
        <Brand onNavigate={onNavigate} />
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3" data-nav-scroller>
        <SidebarNav entries={entries} active={active} onNavigate={onNavigate} testId={testId} />
      </div>
      <div className="shrink-0 border-t border-border px-4 py-3" data-testid="sidebar-footer">
        <AppVersion version={version} />
      </div>
    </>
  );
}

/**
 * The narrow-screen menu (VIS-002): an overlay drawer of about 300 px (at most
 * 85% of the width) from the right in Arabic and the left in English, over a
 * dimmed page that cannot be scrolled or clicked. The close button, a click on
 * the backdrop and Escape close it; following a link closes it too.
 */
function NavDrawer({
  open,
  onOpenChange,
  entries,
  active,
  version,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: readonly NavEntry[];
  active: NavKey | null;
  version: string;
}) {
  const t = useTranslations("nav");
  const dir = localeDirection[useLocale() as Locale];
  // Widening the window to the permanent sidebar closes the drawer.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 64rem)");
    const onChange = () => {
      if (wide.matches) onOpenChange(false);
    };
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, [onOpenChange]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay fixed inset-0 z-50 bg-text/50 lg:hidden" data-testid="drawer-backdrop" />
        <Dialog.Content
          dir={dir}
          aria-describedby={undefined}
          data-testid="nav-drawer"
          className="drawer-panel fixed inset-y-0 start-0 z-50 flex w-[min(18.75rem,85vw)] flex-col bg-surface shadow-xl focus:outline-none lg:hidden"
        >
          <Dialog.Title className="sr-only">{t("label")}</Dialog.Title>
          <Dialog.Close
            className="absolute end-2 top-3 inline-flex size-10 cursor-pointer items-center justify-center rounded-md text-text-muted hover:bg-card hover:text-text focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/40"
            aria-label={t("closeMenu")}
            data-testid="drawer-close"
          >
            <X className="size-5" aria-hidden />
          </Dialog.Close>
          <SidebarColumn
            entries={entries}
            active={active}
            version={version}
            onNavigate={() => onOpenChange(false)}
            testId="drawer-nav"
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("brand");
  return (
    <Link
      href="/"
      onClick={onNavigate}
      className="flex items-center gap-2 font-bold text-primary-dark"
      data-testid="shell-brand"
    >
      <OfficialSymbol size={36} />
      <span className="leading-tight">
        {t("name")}
        <span className="block text-caption font-semibold text-text-muted">
          {t("adminShort")}
        </span>
      </span>
    </Link>
  );
}
