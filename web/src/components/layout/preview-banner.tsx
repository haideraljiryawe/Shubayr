import { getTranslations } from "next-intl/server";
import { Eye } from "lucide-react";

/**
 * Shown above the store while the owner previews it before opening
 * (STORE_PUBLIC=false with the preview cookie — src/lib/store-gate.ts), so a
 * preview is never mistaken for the open store.
 */
export async function PreviewBanner() {
  const t = await getTranslations("comingSoon");
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-text px-4 py-2 text-center text-sm text-background"
      data-testid="store-preview-banner"
    >
      <Eye className="size-4 shrink-0" aria-hidden />
      <span>{t("previewBanner")}</span>
      {/* A full page load on purpose: the proxy clears the preview cookie and the
          signed-in store (cart, inbox) must not survive into the closed page. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/preview?exit=1" className="font-semibold underline" data-testid="store-preview-exit">
        {t("exitPreview")}
      </a>
    </div>
  );
}
