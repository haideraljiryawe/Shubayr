"use client";

import { useTranslations } from "next-intl";
import { ImageIcon } from "lucide-react";

/**
 * How the app shows the category (VIS-009): the main-category card in Arabic
 * and in English, side by side at the same size (stacked only when the
 * dialog is too narrow), each with its artwork in a square; then the square
 * subcategory tile on its own row, so it never squeezes either language.
 * Text is never cut here — the browser clamps it the way the app does, so a
 * long name or description shows its ellipsis.
 */
export function CategoryCardPreview({
  imageUrl,
  nameAr,
  nameEn,
  descriptionAr,
  descriptionEn,
}: {
  imageUrl: string | null;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
}) {
  const t = useTranslations("categories.preview");
  const cards = [
    { dir: "rtl" as const, lang: "ar", name: nameAr || nameEn, description: descriptionAr.trim() || descriptionEn.trim(), label: t("arabic") },
    { dir: "ltr" as const, lang: "en", name: nameEn || nameAr, description: descriptionEn.trim() || descriptionAr.trim(), label: t("english") },
  ];
  return (
    <div className="flex flex-col gap-3" data-testid="category-preview">
      <p className="text-xs font-semibold text-text-muted">{t("title")}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="category-preview-cards">
        {cards.map((card) => (
          <figure key={card.lang} className="flex min-w-0 flex-col gap-1">
            <div
              dir={card.dir}
              lang={card.lang}
              className="flex w-full items-center overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
              data-testid={`category-preview-card-${card.lang}`}
            >
              <div className="relative aspect-square w-[42%] shrink-0 bg-background" data-testid={`category-preview-art-${card.lang}`}>
                <Artwork url={imageUrl} cover />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3">
                <span className="line-clamp-2 text-base font-bold leading-snug" data-testid={`category-preview-name-${card.lang}`}>
                  {card.name || "—"}
                </span>
                {card.description ? (
                  <span className="line-clamp-2 text-xs leading-snug text-text-muted" data-testid={`category-preview-description-${card.lang}`}>
                    {card.description}
                  </span>
                ) : null}
              </div>
            </div>
            <figcaption className="text-xs text-text-muted">{card.label}</figcaption>
          </figure>
        ))}
      </div>
      <figure className="flex items-center gap-3 border-t border-border pt-3" data-testid="category-preview-child">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-background" data-testid="category-preview-tile">
          <Artwork url={imageUrl} cover />
        </div>
        <figcaption className="text-xs text-text-muted">{t("tile")}</figcaption>
      </figure>
    </div>
  );
}

/** The picture, or the app's neutral placeholder when there is none. */
export function Artwork({ url, cover = false }: { url: string | null; cover?: boolean }) {
  if (!url) {
    return (
      <span className="absolute inset-0 flex items-center justify-center text-text-muted" data-testid="artwork-placeholder">
        <ImageIcon className="size-6" aria-hidden />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- stored media or a local preview, shown as is
    <img src={url} alt="" className={`absolute inset-0 size-full ${cover ? "object-cover" : "object-contain"}`} data-testid="artwork-image" />
  );
}
