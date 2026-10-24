import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

/**
 * "الإصدار v1.4.0" / "Version v1.4.0" (VIS-025). The identifier keeps its own
 * left-to-right reading order inside Arabic text.
 */
export function AppVersion({ version, className }: { version: string; className?: string }) {
  const t = useTranslations("common");
  return (
    <p className={cn("text-caption text-text-muted", className)} data-testid="app-version">
      {t("version")}{" "}
      <bdi dir="ltr" className="font-semibold tabular-nums" data-testid="app-version-value">
        {version}
      </bdi>
    </p>
  );
}
