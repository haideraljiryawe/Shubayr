import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ShieldAlert, TriangleAlert } from "lucide-react";
import { buttonClasses, Card } from "@/components/ui";
import type { ApiError } from "@/lib/api/errors";

/**
 * What a page renders when its API call was refused.
 *
 * A 403 is the normal, expected outcome of a staff member opening a URL their
 * permissions do not cover (the menu hides it, but a URL can be typed), so it
 * gets its own calm page instead of an error boundary.
 */
export async function PageError({ error }: { error: ApiError }) {
  const t = await getTranslations("errors");
  const forbidden = error.status === 403;
  const Icon = forbidden ? ShieldAlert : TriangleAlert;

  return (
    <Card
      className="mx-auto mt-8 flex max-w-lg flex-col items-center gap-4 p-8 text-center"
      data-testid={forbidden ? "forbidden" : "page-error"}
      data-status={error.status}
    >
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-card text-primary-dark">
        <Icon className="size-7" aria-hidden />
      </span>
      <h1 className="text-xl font-bold">
        {forbidden ? t("forbiddenTitle") : t("loadFailedTitle")}
      </h1>
      <p className="text-sm text-text-muted">
        {forbidden ? t("forbiddenBody") : t("loadFailedBody")}
      </p>
      <Link href="/" className={buttonClasses({ variant: "secondary" })}>
        {t("backToDashboard")}
      </Link>
    </Card>
  );
}
