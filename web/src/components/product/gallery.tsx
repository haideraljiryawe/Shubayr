"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Package } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Product gallery: a scroll-snap track (same approach as the Phase 2 hero) so
 * swiping works natively and RTL needs no mirroring — the browser reverses the
 * inline axis itself.
 *
 * Desktop adds a cursor-tracking zoom on the active image. Thumbnails double as
 * the dot indicator: they are real buttons, so the gallery is fully keyboard
 * operable without a roving-tabindex dance.
 */
export function ProductGallery({
  images,
  alt,
  activeIndex,
  onActiveIndexChange,
}: {
  images: string[];
  alt: string;
  /** Controlled so choosing a variant can bring its image forward. */
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
}) {
  const t = useTranslations("product");
  const trackRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);

  const scrollTo = useCallback((index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const slide = track.children[index] as HTMLElement | undefined;
    if (slide) track.scrollTo({ left: slide.offsetLeft, behavior: "smooth" });
  }, []);

  // Keep the track in step when the index changes from outside (variant pick).
  useEffect(() => {
    scrollTo(activeIndex);
  }, [activeIndex, scrollTo]);

  const handleScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const index = Math.round(Math.abs(track.scrollLeft) / track.clientWidth);
    const clamped = Math.min(images.length - 1, Math.max(0, index));
    if (clamped !== activeIndex) onActiveIndexChange(clamped);
  }, [images.length, activeIndex, onActiveIndexChange]);

  if (images.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-card">
        <Package className="size-16 text-border" aria-hidden />
        <span className="sr-only">{alt}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-roledescription="carousel"
        aria-label={t("gallery")}
        className="relative overflow-hidden rounded-lg bg-card"
      >
        <div
          ref={trackRef}
          onScroll={handleScroll}
          className={cn(
            "flex snap-x snap-mandatory overflow-x-auto scroll-smooth",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          )}
        >
          {images.map((src, index) => (
            <div
              key={src}
              className="relative aspect-square w-full shrink-0 snap-start"
              aria-hidden={index !== activeIndex}
              onMouseMove={(event) => {
                if (index !== activeIndex) return;
                const box = event.currentTarget.getBoundingClientRect();
                setZoom({
                  x: ((event.clientX - box.left) / box.width) * 100,
                  y: ((event.clientY - box.top) / box.height) * 100,
                });
              }}
              onMouseLeave={() => setZoom(null)}
            >
              <Image
                src={src}
                alt={
                  index === activeIndex
                    ? alt
                    : t("imageOf", { number: index + 1, total: images.length })
                }
                fill
                sizes="(min-width: 1024px) 45vw, 100vw"
                priority={index === 0}
                className={cn(
                  "object-cover transition-transform duration-200",
                  // Zoom only on devices with a real pointer.
                  index === activeIndex && zoom
                    ? "md:scale-150"
                    : "md:scale-100",
                )}
                style={
                  index === activeIndex && zoom
                    ? { transformOrigin: `${zoom.x}% ${zoom.y}%` }
                    : undefined
                }
              />
            </div>
          ))}
        </div>

        <p className="pointer-events-none absolute bottom-2 end-2 hidden rounded-sm bg-surface/85 px-2 py-1 text-[11px] text-text-muted md:block">
          {t("zoomHint")}
        </p>
      </div>

      {images.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((src, index) => (
            <li key={src} className="shrink-0">
              <button
                type="button"
                onClick={() => onActiveIndexChange(index)}
                aria-label={t("goToImage", { number: index + 1 })}
                aria-current={index === activeIndex}
                className={cn(
                  "relative block size-16 overflow-hidden rounded-md border-2 transition-colors lg:size-20",
                  index === activeIndex
                    ? "border-primary-dark"
                    : "border-border hover:border-primary-light",
                )}
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
