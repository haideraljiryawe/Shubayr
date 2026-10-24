"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, KeyRound, Languages, LogOut } from "lucide-react";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { localeDirection, type Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";
import { hardNavigate } from "@/lib/hard-navigate";
import { useSwitchLocale } from "./locale-switch";

const ITEM =
  "flex cursor-pointer select-none items-center gap-3 rounded-md px-3 py-2 text-label text-text outline-none " +
  "data-[highlighted]:bg-card data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60";

/**
 * The account menu in the top bar (VIS-004): who is signed in, the interface
 * language (saved on the account, so it follows the person, not the browser),
 * the password change, and signing out — which asks first; only
 * the confirmation ends the session.
 */
export function AccountMenu({ name, username }: { name: string; username: string | null }) {
  const t = useTranslations("account");
  const locale = useLocale() as Locale;
  const { switchTo, pending } = useSwitchLocale({ account: true });
  const toast = useToast();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const initial = (name || username || "?").trim().charAt(0).toUpperCase();

  return (
    <>
      <Menu.Root dir={localeDirection[locale]} modal={false}>
        <Menu.Trigger
          className={cn(
            "inline-flex h-10 cursor-pointer items-center gap-2 rounded-md px-2 text-text hover:bg-card",
            "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/40",
          )}
          aria-label={t("open")}
          data-testid="account-menu"
        >
          <span
            aria-hidden
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-label text-primary-dark"
          >
            {initial}
          </span>
          <span className="hidden max-w-40 truncate text-label sm:inline" data-testid="current-user">
            {name || username}
          </span>
          <ChevronDown className="size-4 text-text-muted" aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            align="end"
            sideOffset={6}
            collisionPadding={8}
            className="z-40 w-64 rounded-lg border border-border bg-surface p-1.5 shadow-lg"
            data-testid="account-menu-content"
          >
            <div className="px-3 py-2">
              <p className="truncate text-label text-text" data-testid="account-name">{name || username}</p>
              {username ? (
                <p className="truncate text-caption text-text-muted" dir="ltr">
                  {username}
                </p>
              ) : null}
            </div>
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Label className="flex items-center gap-2 px-3 pt-2 pb-1 text-caption text-text-muted">
              <Languages className="size-4" aria-hidden />
              {t("language")}
            </Menu.Label>
            <Menu.RadioGroup
              value={locale}
              onValueChange={(value) => {
                if (value === locale) return;
                void switchTo(value as Locale).then((saved) => {
                  if (!saved) toast(t("languageFailed"));
                });
              }}
            >
              {(["ar", "en"] as const).map((option) => (
                <Menu.RadioItem
                  key={option}
                  value={option}
                  disabled={pending}
                  className={cn(ITEM, "ps-9 relative")}
                  data-testid={`account-locale-${option}`}
                >
                  <Menu.ItemIndicator className="absolute start-3 inline-flex">
                    <Check className="size-4 text-primary-dark" aria-hidden />
                  </Menu.ItemIndicator>
                  <span lang={option}>{option === "ar" ? "العربية" : "English"}</span>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Item asChild className={ITEM}>
              <Link href="/change-password" data-testid="account-change-password">
                <KeyRound className="size-4 text-text-muted" aria-hidden />
                {t("changePassword")}
              </Link>
            </Menu.Item>
            <Menu.Item
              className={cn(ITEM, "text-error-dark")}
              onSelect={() => setConfirmSignOut(true)}
              data-testid="sign-out"
            >
              <LogOut className="size-4 rtl:-scale-x-100" aria-hidden />
              {t("signOut")}
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>

      <ConfirmDialog
        open={confirmSignOut}
        title={t("signOutTitle")}
        body={t("signOutBody")}
        confirmLabel={t("signOut")}
        requireReason={false}
        onClose={() => setConfirmSignOut(false)}
        onConfirm={async () => {
          await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
          hardNavigate("/login");
        }}
      />
    </>
  );
}
