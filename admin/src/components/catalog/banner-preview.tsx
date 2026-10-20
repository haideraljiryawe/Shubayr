"use client";

import { useTranslations } from "next-intl";
import { ImageIcon } from "lucide-react";
import type { BannerActionType } from "@/lib/banners";

/**
 * The banner as customers will see it, from the same 2:1 picture:
 * - phone (the app): the picture fills the card, text over a dark scrim;
 * - desktop (the web store): the green card with the text and the picture
 *   beside it, whole (contained, never stretched).
 * Image-only banners (show_text off) draw the picture alone, with no title,
 * subtitle or button. Without an action nothing looks clickable.
 */
export function BannerPreview({
  imageUrl,
  title,
  subtitle,
  cta,
  showText,
  action,
  destination,
  language,
}: {
  imageUrl: string | null;
  title: string;
  subtitle: string;
  cta: string;
  showText: boolean;
  action: BannerActionType;
  /** Where a tap goes, in words (the link, product or category name). */
  destination: string;
  language: "ar" | "en";
}) {
  const t = useTranslations("banners.preview");
  const clickable = action !== "none";
  const showCta = showText && clickable && cta.trim() !== "";
  const dir = language === "ar" ? "rtl" : "ltr";
  const picture = (fit: "cover" | "contain") =>
    imageUrl ? (
      // eslint-disable-next-line @next/next/no-img-element -- stored media or a local preview
      <img src={imageUrl} alt="" className={`absolute inset-0 size-full ${fit === "cover" ? "object-cover" : "object-contain"}`} />
    ) : (
      <span className="absolute inset-0 flex items-center justify-center bg-background text-text-muted">
        <ImageIcon className="size-6" aria-hidden />
      </span>
    );

  return (
    <div className="flex flex-col gap-3" data-testid="banner-preview" data-show-text={String(showText)} data-action={action} lang={language}>
      <div className="flex flex-wrap items-start gap-4">
        <figure className="flex flex-col gap-1">
          <div className="relative aspect-[2/1] w-[320px] overflow-hidden rounded-2xl bg-primary-dark shadow-sm" data-testid="banner-preview-phone">
            {picture("cover")}
            {showText && (title || subtitle) ? (
              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8 text-white" dir={dir}>
                <span className="line-clamp-2 text-base font-bold leading-tight" data-testid="banner-preview-title">
                  {title}
                </span>
                {subtitle ? <span className="line-clamp-2 text-xs text-white/90">{subtitle}</span> : null}
              </div>
            ) : null}
          </div>
          <figcaption className="text-xs text-text-muted">{t("phone")}</figcaption>
        </figure>

        <figure className="flex min-w-0 flex-1 flex-col gap-1">
          {showText ? (
            <div
              className="relative flex min-h-40 items-center gap-4 overflow-hidden rounded-lg bg-gradient-to-bl from-primary to-primary-dark p-5"
              data-testid="banner-preview-desktop"
              dir={dir}
            >
              <div className="flex min-w-0 max-w-[50%] flex-col items-start gap-2 text-white">
                <span className="line-clamp-2 text-xl font-bold leading-tight">{title}</span>
                {subtitle ? <span className="line-clamp-2 text-sm font-semibold text-white/90">{subtitle}</span> : null}
                {showCta ? (
                  <span className="mt-1 rounded-full bg-background px-4 py-1.5 text-sm font-semibold text-primary-dark" data-testid="banner-preview-cta">
                    {cta}
                  </span>
                ) : null}
              </div>
              <div className="relative ms-auto aspect-[2/1] w-[45%] shrink-0">{picture("contain")}</div>
            </div>
          ) : (
            <div className="relative aspect-[2/1] w-full max-w-[640px] overflow-hidden rounded-lg bg-primary-dark" data-testid="banner-preview-desktop">
              {picture("cover")}
            </div>
          )}
          <figcaption className="text-xs text-text-muted">{t("desktop")}</figcaption>
        </figure>
      </div>
      {showText ? null : (
        <p className="text-xs text-text-muted" data-testid="banner-preview-image-only">
          {t("imageOnly")}
        </p>
      )}
      <p className="text-xs text-text-muted" data-testid="banner-preview-action">
        {clickable ? (showCta ? t("actionButton", { destination }) : t("actionWhole", { destination })) : t("actionNone")}
      </p>
    </div>
  );
}
