"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, LogOut } from "lucide-react";
import { RequireAuth } from "@/components/auth/require-auth";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { ACCOUNT_MENU, accountHref } from "./account-menu";

/**
 * The account layout: the mockup's profile header and menu list.
 *
 * On mobile the menu is the page — exactly the app screen — and a section
 * replaces it. From `lg` up the same menu becomes a sidebar beside the section,
 * so a desktop visitor never loses their place.
 */
export function AccountShell({
  children,
  /** True on /account itself, where the menu is the content. */
  isRoot = false,
  title,
}: {
  children?: ReactNode;
  isRoot?: boolean;
  title?: string;
}) {
  return (
    <RequireAuth>
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
        <h1 className="mb-5 text-2xl font-bold text-text lg:text-3xl">
          {title}
        </h1>

        <div className="grid items-start gap-6 lg:grid-cols-[18rem_1fr]">
          {/* The menu is hidden on mobile inside a section, where the back link
              carries the way out; on desktop it is always the sidebar. */}
          <div className={cn(isRoot ? "block" : "hidden lg:block")}>
            <ProfileHeader />
            <AccountMenu className="mt-4" />
          </div>

          {children ? <div className="min-w-0">{children}</div> : null}
        </div>
      </div>
    </RequireAuth>
  );
}

function ProfileHeader() {
  const t = useTranslations("account");
  const { user } = useAuth();

  return (
    <Card padding="md" className="flex items-center gap-3">
      <Avatar name={user?.name ?? undefined} size="lg" />
      <div className="min-w-0">
        <p className="truncate font-bold text-text">
          {user?.name || t("guestName")}
        </p>
        {/* A phone number is Latin digits: isolate it from the RTL run. */}
        <p
          dir="ltr"
          className="truncate text-sm text-text-muted [unicode-bidi:isolate]"
          data-testid="account-phone"
        >
          {user?.phone}
        </p>
      </div>
    </Card>
  );
}

function AccountMenu({ className }: { className?: string }) {
  const t = useTranslations("account");
  const { logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const showToast = useToast();
  const tAuth = useTranslations("auth");

  const row =
    "flex w-full items-center gap-3 px-4 py-3.5 text-sm font-medium " +
    "transition-colors hover:bg-card";

  return (
    <Card padding="none" className={cn("overflow-hidden", className)}>
      <nav aria-label={t("menu")}>
        <ul className="divide-y divide-border" data-testid="account-menu">
          {ACCOUNT_MENU.map((item) => {
            const href = accountHref(item.key);
            const active = pathname === href || pathname.startsWith(`${href}/`);
            const Icon = item.icon;

            return (
              <li key={item.key}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  data-testid={`account-link-${item.key}`}
                  className={cn(
                    row,
                    active ? "bg-card text-primary-dark" : "text-text",
                  )}
                >
                  <Icon
                    className="size-5 shrink-0 text-primary-dark"
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{t(item.key)}</span>
                  <ChevronLeft
                    className="size-4 shrink-0 text-text-muted rtl-flip"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}

          <li>
            <button
              type="button"
              data-testid="account-signout"
              onClick={() => {
                logout();
                showToast(tAuth("signedOut"));
                router.replace("/");
              }}
              className={cn(row, "cursor-pointer text-error-dark")}
            >
              <LogOut className="size-5 shrink-0 rtl-flip" aria-hidden />
              <span className="flex-1 text-start">{t("signOut")}</span>
            </button>
          </li>
        </ul>
      </nav>
    </Card>
  );
}

/** Section header with the mobile-only way back to the menu. */
export function SectionHeading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  const t = useTranslations("account");

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Link
          href="/account"
          aria-label={t("backToAccount")}
          className="inline-flex size-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-card lg:hidden"
        >
          <ChevronLeft className="size-5 rtl-flip rotate-180" aria-hidden />
        </Link>
        <h2 className="text-lg font-bold text-text">{title}</h2>
      </div>
      {children}
    </div>
  );
}
