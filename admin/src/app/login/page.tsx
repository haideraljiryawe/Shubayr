import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "./login-form";
import { AuthFrame } from "@/components/shell/auth-frame";
import { safeReturnPath } from "@/lib/return-path";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("signInTitle") };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; expired?: string }>;
}) {
  const { next, expired } = await searchParams;
  // Only same-site paths: `?next=//evil.example` must not become a redirect.
  const safeNext = safeReturnPath(next);
  return (
    <AuthFrame>
      <LoginForm next={safeNext} expired={expired === "1"} />
    </AuthFrame>
  );
}
