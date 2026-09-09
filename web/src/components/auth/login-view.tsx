"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { OtpForm } from "./otp-form";

/** Only in-app paths are honoured, so `?next=` cannot bounce to another site. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/account";
}

export function LoginView() {
  const t = useTranslations("auth");
  const { isAuthenticated, ready } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const showToast = useToast();

  const next = safeNext(searchParams.get("next"));

  // Someone already signed in has nothing to do here.
  useEffect(() => {
    if (ready && isAuthenticated) router.replace(next);
  }, [ready, isAuthenticated, router, next]);

  return (
    <div className="mx-auto max-w-lg px-4 py-8 lg:py-12">
      <h1 className="mb-5 text-center text-2xl font-bold text-text">
        {t("loginTitle")}
      </h1>

      <Card padding="lg">
        <OtpForm
          onSignedIn={(user) => {
            showToast(
              user.name ? t("welcome", { name: user.name }) : t("signedIn"),
            );
            router.replace(next);
          }}
        />
      </Card>
    </div>
  );
}
