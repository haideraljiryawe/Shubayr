"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Banknote,
  Check,
  CreditCard,
  Globe,
  HelpCircle,
  Info,
  LogOut,
  Mail,
  MessageCircle,
  Phone,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/ui/toast";
import { usePathname, useRouter } from "@/i18n/navigation";
import { localeLabel, routing, type Locale } from "@/i18n/routing";
import {
  api,
  type NotificationChannel,
  type NotificationPreferences,
  type NotificationType,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { useResource } from "@/lib/use-resource";
import { AccountError, AccountSkeleton } from "./states";

/* -------------------------------------------------------------- payments */

/**
 * Payment methods. Cash on delivery is the only one the contract supports —
 * `Order.payment_method` is the single-value enum `[cod]` — so the page states
 * that plainly instead of showing card fields that could not be submitted.
 */
export function PaymentMethodsPanel() {
  const t = useTranslations("settings");

  return (
    <div className="flex flex-col gap-4">
      <Card padding="md" className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary-dark">
          <Banknote className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-text">{t("codTitle")}</h2>
            <Badge tone="success" data-testid="payments-cod">
              <Check className="me-1 size-3" aria-hidden />
              {t("codOnly")}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-text-muted">{t("codBody")}</p>
        </div>
      </Card>

      <Card
        padding="md"
        className="flex items-start gap-3 opacity-80"
        data-testid="payments-soon"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-text-muted">
          <CreditCard className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-text-muted">
            {t("gatewaysSoon")}
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            {t("gatewaysSoonBody")}
          </p>
        </div>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------- notifications */

/**
 * The ten notification types across both channels, in the order the contract
 * lists them — which is also roughly the order a shopper meets them.
 */
const NOTIFICATION_TYPES: NotificationType[] = [
  "order_placed",
  "order_confirmed",
  "order_status_changed",
  "out_for_delivery",
  "delivered",
  "delivery_failed",
  "return_update",
  "loyalty_points_earned",
  "review_moderated",
  "promo",
];

const CHANNELS: NotificationChannel[] = ["push", "sms"];

/** Order-confirmation SMS is mandatory; the contract refuses to turn it off. */
function isMandatory(
  type: NotificationType,
  channel: NotificationChannel,
): boolean {
  return type === "order_confirmed" && channel === "sms";
}

function prefKey(type: NotificationType, channel: NotificationChannel): string {
  return `${type}:${channel}`;
}

/**
 * Per-type, per-channel notification preferences, read and written through
 * GET/PATCH /me/notification-preferences.
 *
 * These are ACCOUNT-level: the contract says an update is shared by every
 * device on the account, so this is not a device setting and there is nothing
 * local to reconcile. It is also not push REGISTRATION — receiving web push
 * needs a service worker and an FCM token this app does not mint, so the note
 * at the bottom says so rather than implying a toggle is enough.
 */
export function NotificationPrefsPanel() {
  const t = useTranslations("settings");
  const showToast = useToast();

  const {
    data: prefs,
    failed,
    reload,
  } = useResource<NotificationPreferences>(
    () => api.getNotificationPreferences(),
    [],
  );

  /** Pairs with a PATCH in flight, so each toggle can show its own spinner. */
  const [saving, setSaving] = useState<Set<string>>(new Set());
  /** The server's answer, adopted verbatim once a PATCH lands. */
  const [current, setCurrent] = useState<NotificationPreferences | null>(null);

  const effective = current ?? prefs;

  const enabled = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const entry of effective?.preferences ?? []) {
      map.set(prefKey(entry.type, entry.channel), entry.enabled);
    }
    return map;
  }, [effective]);

  async function toggle(
    type: NotificationType,
    channel: NotificationChannel,
    next: boolean,
  ) {
    const key = prefKey(type, channel);
    setSaving((busy) => new Set(busy).add(key));
    try {
      // Only the pair that moved is sent: the contract leaves omitted pairs
      // alone, so there is no need to restate the other nineteen.
      const updated = await api.updateNotificationPreferences([
        { type, channel, enabled: next },
      ]);
      setCurrent(updated);
      showToast(t("notifySaved"));
    } catch {
      // Nothing local changed, so the row simply stays where it was.
      showToast(t("notifyFailed"));
    } finally {
      setSaving((busy) => {
        const rest = new Set(busy);
        rest.delete(key);
        return rest;
      });
    }
  }

  if (failed) return <AccountError onRetry={reload} />;
  if (!effective) return <AccountSkeleton rows={5} />;

  return (
    <div className="flex flex-col gap-4">
      <Card padding="md" className="flex flex-col gap-1">
        <p className="text-sm text-text-muted">{t("notificationsBody")}</p>
      </Card>

      <Card padding="none" className="overflow-hidden">
        {/* Channel headings, so each row's two switches are identifiable. */}
        <div className="flex items-center gap-4 border-b border-border bg-card px-4 py-2.5">
          <span className="flex-1 text-xs font-semibold text-text-muted">
            {t("notifyType")}
          </span>
          {CHANNELS.map((channel) => (
            <span
              key={channel}
              className="w-12 text-center text-xs font-semibold text-text-muted"
            >
              {t(`channel_${channel}`)}
            </span>
          ))}
        </div>

        <ul className="divide-y divide-border" data-testid="notification-prefs">
          {NOTIFICATION_TYPES.map((type) => (
            <li
              key={type}
              className="flex items-center gap-4 px-4 py-3.5"
              data-testid={`notify-row-${type}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-text">
                  {t(`notifyType_${type}`)}
                </span>
              </span>

              {CHANNELS.map((channel) => {
                const key = prefKey(type, channel);
                const id = `notify-${type}-${channel}`;
                const locked = isMandatory(type, channel);

                return (
                  <span
                    key={channel}
                    className="flex w-12 justify-center"
                    title={locked ? t("notifyMandatory") : undefined}
                  >
                    <Toggle
                      id={id}
                      data-testid={id}
                      checked={enabled.get(key) ?? false}
                      // The server refuses to disable it, so the UI does not
                      // offer an action that would only come back rejected.
                      disabled={locked || saving.has(key)}
                      aria-label={`${t(`notifyType_${type}`)} — ${t(
                        `channel_${channel}`,
                      )}`}
                      onChange={(event) =>
                        void toggle(type, channel, event.target.checked)
                      }
                    />
                  </span>
                );
              })}
            </li>
          ))}
        </ul>
      </Card>

      <p className="flex items-start gap-1.5 text-xs text-text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {t("notifyAccountWide")}
      </p>

      {/*
        Being honest about the half that is not built: the preference is stored
        and respected by the backend's fan-out, but this browser has registered
        no push token, so nothing will actually arrive here.
      */}
      <p className="flex items-start gap-1.5 text-xs text-text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {t("notifyPushSetup")}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- language */

/**
 * AR ⇄ EN as a real radio group, wired to next-intl's router so the whole app
 * re-renders in the chosen language and the visitor stays on the same page.
 * The locale then rides every link, which is how next-intl persists it.
 */
export function LanguagePanel() {
  const t = useTranslations("settings");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const showToast = useToast();
  const [isPending, startTransition] = useTransition();

  const choose = (next: Locale) => {
    if (next === locale) return;
    showToast(t("languageSaved"));
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card padding="md">
        <p className="text-sm text-text-muted">{t("languageBody")}</p>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <ul
          role="radiogroup"
          aria-label={t("languageTitle")}
          className="divide-y divide-border"
          data-testid="language-options"
        >
          {routing.locales.map((option) => {
            const active = option === locale;

            return (
              <li key={option}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={isPending}
                  data-testid={`language-${option}`}
                  onClick={() => choose(option)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 px-4 py-3.5",
                    "text-sm font-medium transition-colors hover:bg-card",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    active ? "text-primary-dark" : "text-text",
                  )}
                >
                  <Globe
                    className="size-5 shrink-0 text-primary-dark"
                    aria-hidden
                  />
                  <span className="flex-1 text-start">
                    {localeLabel[option]}
                  </span>
                  {active ? (
                    <Check className="size-5 shrink-0" aria-hidden />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ help */

const SUPPORT_PHONE = "+9647700000000";
const SUPPORT_EMAIL = "support@shubayr.example";

export function HelpPanel() {
  const t = useTranslations("settings");

  const channels: [string, string, string, typeof Phone][] = [
    [t("helpCall"), SUPPORT_PHONE, `tel:${SUPPORT_PHONE}`, Phone],
    [
      t("helpWhatsapp"),
      SUPPORT_PHONE,
      `https://wa.me/${SUPPORT_PHONE.replace("+", "")}`,
      MessageCircle,
    ],
    [t("helpEmail"), SUPPORT_EMAIL, `mailto:${SUPPORT_EMAIL}`, Mail],
  ];

  const faqs: [string, string][] = [
    [t("faq1Q"), t("faq1A")],
    [t("faq2Q"), t("faq2A")],
    [t("faq3Q"), t("faq3A")],
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card padding="md" className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary-dark">
          <HelpCircle className="size-5" aria-hidden />
        </span>
        <p className="text-sm text-text-muted">{t("helpBody")}</p>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <ul className="divide-y divide-border" data-testid="help-channels">
          {channels.map(([label, value, href, Icon]) => (
            <li key={label}>
              <a
                href={href}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-card"
              >
                <Icon
                  className="size-5 shrink-0 text-primary-dark"
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-text">
                    {label}
                  </span>
                  {/* A phone number or an address is a Latin run in Arabic. */}
                  <span
                    dir="ltr"
                    className="block text-xs text-text-muted [unicode-bidi:isolate] text-start"
                  >
                    {value}
                  </span>
                </span>
              </a>
            </li>
          ))}

          <li className="flex items-center gap-3 px-4 py-3.5">
            <Clock className="size-5 shrink-0 text-primary-dark" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-text">
                {t("helpHours")}
              </span>
              <span className="block text-xs text-text-muted">
                {t("helpHoursValue")}
              </span>
            </span>
          </li>
        </ul>
      </Card>

      <Card padding="md" className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-text">{t("faqTitle")}</h2>
        <dl className="flex flex-col divide-y divide-border">
          {faqs.map(([question, answer]) => (
            <div key={question} className="py-3 first:pt-0 last:pb-0">
              <dt className="text-sm font-medium text-text">{question}</dt>
              <dd className="mt-1 text-sm text-text-muted">{answer}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------- settings */

export function SettingsPanel() {
  const t = useTranslations("settings");
  const tAccount = useTranslations("account");
  const tAuth = useTranslations("auth");
  const { user, logout } = useAuth();
  const router = useRouter();
  const showToast = useToast();

  return (
    <div className="flex flex-col gap-4">
      <Card padding="md">
        <p className="text-sm text-text-muted">{t("settingsBody")}</p>
      </Card>

      <Card padding="md" className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-text">{t("accountSection")}</h2>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-text-muted">{tAccount("name")}</dt>
            <dd className="font-medium text-text">
              {user?.name || tAccount("guestName")}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-text-muted">{tAccount("phoneLocked")}</dt>
            <dd
              dir="ltr"
              className="font-medium text-text [unicode-bidi:isolate]"
            >
              {user?.phone}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-text-muted">{t("version")}</dt>
            <dd dir="ltr" className="font-medium text-text [unicode-bidi:isolate]">
              0.1.0
            </dd>
          </div>
        </dl>
      </Card>

      <Card padding="md" className="flex flex-col gap-3">
        <p className="text-sm text-text-muted">{t("signOutBody")}</p>
        <Button
          variant="secondary"
          data-testid="settings-signout"
          startIcon={<LogOut className="size-4 rtl-flip" aria-hidden />}
          className="self-start text-error-dark"
          onClick={() => {
            logout();
            showToast(tAuth("signedOut"));
            router.replace("/");
          }}
        >
          {tAccount("signOut")}
        </Button>
      </Card>
    </div>
  );
}
