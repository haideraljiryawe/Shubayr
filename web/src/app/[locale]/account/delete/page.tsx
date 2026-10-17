import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DeleteAccount } from "@/components/account/delete-account";
import { Link } from "@/i18n/navigation";
import { infoPageMetadata, infoStoreName } from "@/lib/info-pages";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const [t, storeName] = await Promise.all([getTranslations({ locale, namespace: "deleteAccount" }), infoStoreName(locale)]);
  return infoPageMetadata({
    locale,
    path: "/account/delete",
    title: t("title"),
    description: t("intro", { store: storeName }),
    storeName,
  });
}

/**
 * The public "delete my account" page the app stores ask for: what is deleted,
 * what is kept and why, and the deletion itself. Not behind the account's
 * sign-in guard — a signed-out visitor reads it and signs in here — and open
 * even while the store is "opening soon" (src/lib/store-gate.ts).
 */
export default async function DeleteAccountPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, legal, storeName] = await Promise.all([
    getTranslations("deleteAccount"),
    getTranslations("legal"),
    infoStoreName(locale),
  ]);
  const deleted = t.raw("deleted") as string[];
  const kept = t.raw("kept") as string[];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 lg:px-8" data-testid="delete-account-page">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-text sm:text-3xl">{t("title")}</h1>
        <p className="text-base text-text-muted">{t("intro", { store: storeName })}</p>
      </header>

      <section className="flex flex-col gap-2" data-testid="delete-what-deleted">
        <h2 className="text-lg font-bold text-text">{t("deletedTitle")}</h2>
        <ul className="flex list-disc flex-col gap-1.5 ps-5 text-sm leading-relaxed text-text">
          {deleted.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2" data-testid="delete-what-kept">
        <h2 className="text-lg font-bold text-text">{t("keptTitle")}</h2>
        <ul className="flex list-disc flex-col gap-1.5 ps-5 text-sm leading-relaxed text-text">
          {kept.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="text-sm text-text-muted">
          <Link href="/privacy" className="font-semibold text-primary-dark underline-offset-4 hover:underline">
            {legal("privacy")}
          </Link>
        </p>
      </section>

      <section className="flex flex-col gap-2" data-testid="delete-before">
        <h2 className="text-lg font-bold text-text">{t("beforeTitle")}</h2>
        <p className="text-sm leading-relaxed text-text">{t("before")}</p>
        <p className="text-sm leading-relaxed text-text-muted">{t("afterNote")}</p>
      </section>

      <DeleteAccount />
    </div>
  );
}
