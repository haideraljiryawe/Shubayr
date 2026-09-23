"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { OtpForm } from "@/components/auth/otp-form";
import type { User } from "@/lib/api";

/* ---------------------------------------------------------------------------
 * «سجّل الدخول لإتمام الطلب».
 *
 * POST /orders is an authenticated endpoint, so a signed-out shopper meets this
 * before the order is placed. It is the same phone-OTP form as the login page —
 * only the framing copy differs — seeded with the number they already typed
 * into their delivery address so they do not type it twice.
 * ------------------------------------------------------------------------- */

export function AuthGate({
  defaultPhone = "",
  onSignedIn,
  onBack,
}: {
  defaultPhone?: string;
  onSignedIn: (user: User) => void;
  onBack: () => void;
}) {
  const t = useTranslations("checkout");

  return (
    <Card padding="lg" className="mx-auto flex max-w-lg flex-col gap-4">
      <div className="text-center">
        <h2 className="text-xl font-bold text-text">{t("authTitle")}</h2>
        <p className="mt-1 text-sm text-text-muted">{t("authBody")}</p>
      </div>

      <OtpForm
        defaultPhone={defaultPhone}
        onSignedIn={onSignedIn}
        onCancel={onBack}
        cancelLabel={t("back")}
      />
    </Card>
  );
}
