import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { LocaleSwitch } from "./locale-switch";

/** The centred card the sign-in and password screens sit in. */
export async function AuthFrame({ children }: { children: ReactNode }) {
  const t = await getTranslations("brand");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-11 items-center justify-center rounded-md bg-primary-dark text-lg font-bold text-on-primary">
          ش
        </span>
        <div>
          <p className="text-lg font-bold text-primary-dark">{t("name")}</p>
          <p className="text-xs font-semibold text-text-muted">{t("admin")}</p>
        </div>
      </div>
      <Card className="w-full max-w-md p-6 sm:p-8">{children}</Card>
      <LocaleSwitch />
    </main>
  );
}
