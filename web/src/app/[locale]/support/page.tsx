import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Clock, Mail, MapPin, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PolicyLinks } from "@/components/legal/policy-links";
import { Link } from "@/i18n/navigation";
import { infoPageMetadata, infoStore } from "@/lib/info-pages";
import { inLocale, telLink, whatsappLink } from "@/lib/store-info";
import { storeIsPublic } from "@/lib/store-gate";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const [t, { storeName }] = await Promise.all([getTranslations({ locale, namespace: "support" }), infoStore(locale)]);
  return infoPageMetadata({
    locale,
    path: "/support",
    title: t("title"),
    description: t("intro", { store: storeName }),
    storeName,
  });
}

/**
 * Contact page: phone, WhatsApp, e-mail, hours and address, from the store's
 * public settings (filled in from the Web Admin). A channel the owner hasn't
 * entered is simply not listed; with none at all the page says so plainly.
 * Open even while the store is "opening soon" (src/lib/store-gate.ts).
 */
export default async function SupportPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, { storeName, info }] = await Promise.all([getTranslations("support"), infoStore(locale)]);

  const channels = [
    info.phone ? { key: "phone", label: t("call"), value: info.phone, href: telLink(info.phone), Icon: Phone } : null,
    info.whatsapp ? { key: "whatsapp", label: t("whatsapp"), value: info.whatsapp, href: whatsappLink(info.whatsapp), Icon: MessageCircle } : null,
    info.email ? { key: "email", label: t("email"), value: info.email, href: `mailto:${info.email}`, Icon: Mail } : null,
    info.privacyEmail
      ? { key: "privacy", label: t("privacy"), value: info.privacyEmail, href: `mailto:${info.privacyEmail}`, Icon: ShieldCheck }
      : null,
  ].filter((channel) => channel !== null);
  const hours = inLocale(info.hours, locale);
  const address = [inLocale(info.legalName, locale), inLocale(info.address, locale)].filter(Boolean).join(locale === "en" ? ", " : "، ");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 lg:px-8" data-testid="support-page">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-text sm:text-3xl">{t("title")}</h1>
        <p className="text-base text-text-muted">{t("intro", { store: storeName })}</p>
      </header>

      {channels.length || hours || address ? (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-border">
            {channels.map(({ key, label, value, href, Icon }) => (
              <li key={key}>
                <a
                  href={href}
                  data-testid={`support-${key}`}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-card"
                >
                  <Icon className="size-5 shrink-0 text-primary-dark" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-text">{label}</span>
                    {/* A phone number or an address is a Latin run in Arabic. */}
                    <span dir="ltr" className="block text-start text-sm text-text-muted [unicode-bidi:isolate]">
                      {value}
                    </span>
                  </span>
                </a>
              </li>
            ))}
            {hours ? (
              <li className="flex items-center gap-3 px-4 py-3.5" data-testid="support-hours">
                <Clock className="size-5 shrink-0 text-primary-dark" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-text">{t("hours")}</span>
                  <span className="block text-sm text-text-muted">{hours}</span>
                </span>
              </li>
            ) : null}
            {address ? (
              <li className="flex items-center gap-3 px-4 py-3.5" data-testid="support-address">
                <MapPin className="size-5 shrink-0 text-primary-dark" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-text">{t("address")}</span>
                  <span className="block text-sm text-text-muted">{address}</span>
                </span>
              </li>
            ) : null}
          </ul>
        </Card>
      ) : (
        <Card padding="md" data-testid="support-none">
          <p className="text-sm text-text-muted">{t("noContactYet")}</p>
        </Card>
      )}

      {storeIsPublic() ? (
        <p className="text-sm text-text-muted">
          {t("orderHelp")}{" "}
          <Link href="/account/orders" className="font-semibold text-primary-dark underline-offset-4 hover:underline">
            {t("myOrders")}
          </Link>
        </p>
      ) : null}

      <Card padding="md">
        <PolicyLinks only={["privacy", "terms", "returns", "deleteAccount"]} />
      </Card>
    </div>
  );
}
