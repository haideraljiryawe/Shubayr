import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { LocaleSwitch } from "./locale-switch";
import { OfficialSymbol } from "./official-symbol";

/**
 * The centred card the sign-in and password screens sit in, under the
 * official symbol and "Shubayr · Admin panel" — so staff can tell it from the
 * customers' store sign-in at a glance.
 */
export async function AuthFrame({ children }: { children: ReactNode }) {
  const t = await getTranslations("brand");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center" data-testid="auth-brand">
        <OfficialSymbol size={80} priority />
        <div>
          <p className="text-lg font-bold text-primary-dark">{t("name")}</p>
          <p className="text-sm font-semibold text-text-muted">{t("admin")}</p>
        </div>
      </div>
      <Card className="w-full max-w-md p-6 sm:p-8">{children}</Card>
      <LocaleSwitch />
    </main>
  );
}
