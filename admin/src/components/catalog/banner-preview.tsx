"use client";

import { useTranslations } from "next-intl";
import { ImageIcon } from "lucide-react";

/**
 * The banner as customers will see it, from the same 2:1 picture:
 * - phone (the app): the picture fills the card, text over a dark scrim;
 * - desktop (the web store): the green card with the text and the picture
 *   beside it, whole (contained, never stretched).
 * Without a link nothing looks clickable: no button is drawn.
 */
export function BannerPreview({
  imageUrl,
  title,
  subtitle,
  cta,
  hasLink,
}: {
  imageUrl: string | null;
  title: string;
  subtitle: string;
  cta: string;
  hasLink: boolean;
}) {
  const t = useTranslations("banners.preview");
  const showCta = hasLink && cta.trim() !== "";
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
    <div className="flex flex-col gap-3" data-testid="banner-preview">
      <div className="flex flex-wrap items-start gap-4">
        <figure className="flex flex-col gap-1">
          <div className="relative aspect-[2/1] w-[320px] overflow-hidden rounded-2xl bg-primary-dark shadow-sm" data-testid="banner-preview-phone">
            {picture("cover")}
            {title || subtitle ? (
              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8 text-white" dir="auto">
                <span className="line-clamp-2 text-base font-bold leading-tight">{title}</span>
                {subtitle ? <span className="line-clamp-2 text-xs text-white/90">{subtitle}</span> : null}
              </div>
            ) : null}
          </div>
          <figcaption className="text-xs text-text-muted">{t("phone")}</figcaption>
        </figure>

        <figure className="flex min-w-0 flex-1 flex-col gap-1">
          <div
            className="relative flex min-h-40 items-center gap-4 overflow-hidden rounded-lg bg-gradient-to-bl from-primary to-primary-dark p-5"
            data-testid="banner-preview-desktop"
          >
            <div className="flex min-w-0 max-w-[50%] flex-col items-start gap-2 text-white" dir="auto">
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
          <figcaption className="text-xs text-text-muted">{t("desktop")}</figcaption>
        </figure>
      </div>
      <p className="text-xs text-text-muted" data-testid="banner-preview-action">
        {hasLink ? (showCta ? t("actionButton") : t("actionWhole")) : t("actionNone")}
      </p>
    </div>
  );
}
