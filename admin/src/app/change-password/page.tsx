import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthFrame } from "@/components/shell/auth-frame";
import { ERROR_CODES, toApiError } from "@/lib/api/errors";
import { serverApi } from "@/lib/api/server";
import { ChangePasswordForm } from "./change-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("password");
  return { title: t("title") };
}

/**
 * The password change, forced or voluntary.
 *
 * While a temporary password is in force the API refuses every admin route
 * except this change with 403 PASSWORD_CHANGE_REQUIRED — which is also how
 * this page knows the change is forced, and why it does not use `load()`
 * (that helper redirects here on exactly that code).
 */
export default async function ChangePasswordPage() {
  const api = await serverApi();
  let status = 0;
  let body: unknown = null;
  try {
    const { error, response } = await api.GET("/me");
    status = response.status;
    body = error;
  } catch {
    // An unreachable API: the form's own submit will report it.
  }
  if (status === 401) redirect("/api/auth/expired");
  const forced =
    status === 403 &&
    toApiError(403, body).code === ERROR_CODES.passwordChangeRequired;

  return (
    <AuthFrame>
      <ChangePasswordForm forced={forced} />
    </AuthFrame>
  );
}
