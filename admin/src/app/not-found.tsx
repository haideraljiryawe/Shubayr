import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonClasses, Card } from "@/components/ui";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  const tErrors = await getTranslations("errors");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <Card
        className="flex max-w-md flex-col items-center gap-3 p-8 text-center"
        data-testid="not-found"
      >
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <p className="text-sm text-text-muted">{t("body")}</p>
        <Link href="/" className={buttonClasses({ variant: "secondary" })}>
          {tErrors("backToDashboard")}
        </Link>
      </Card>
    </main>
  );
}
