import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { releaseVersion } from "@/lib/release-version";
import { AppVersion } from "./app-version";
import { LocaleSwitch } from "./locale-switch";
import { OfficialSymbol } from "./official-symbol";

/**
 * The centred card the sign-in and password screens sit in (VIS-001): the
 * official symbol and the Shubayr name once, the card, the light language
 * control, and the running version at the bottom (VIS-025).
 */
export async function AuthFrame({ children }: { children: ReactNode }) {
  const t = await getTranslations("brand");
  const version = await releaseVersion();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center" data-testid="auth-brand">
        <OfficialSymbol size={72} priority />
        <p className="text-section text-primary-dark">{t("name")}</p>
      </div>
      <Card className="w-full max-w-md p-6 sm:p-8">{children}</Card>
      <LocaleSwitch />
      <AppVersion version={version} className="mt-auto pt-4" />
    </main>
  );
}
