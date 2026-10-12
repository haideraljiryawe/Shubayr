import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonClasses, Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("modules");
  return { title: t("disabledTitle") };
}

/**
 * Where src/proxy.ts sends a route whose module ADMIN_MODULES leaves off —
 * the delivery add-ons in a launch configuration. Nothing is wrong and
 * nothing was refused; the section is simply not part of this installation.
 */
export default async function ModuleDisabledPage() {
  const t = await getTranslations("modules");
  return (
    <div data-testid="module-disabled">
      <PageHeader title={t("disabledTitle")} description={t("disabledBody")} />
      <Card className="flex flex-col items-start gap-3">
        <p className="text-sm text-text-muted">{t("disabledHint")}</p>
        <Link href="/" className={buttonClasses({ variant: "secondary" })}>
          {t("backHome")}
        </Link>
      </Card>
    </div>
  );
}
