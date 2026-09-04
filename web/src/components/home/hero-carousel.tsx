"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Banner } from "@/lib/mock-data";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { HeroBanner } from "./hero-banner";

const AUTOPLAY_MS = 6000;

/**
 * Promo carousel: native scroll-snap for swiping (so touch and trackpad feel
 * right with no gesture library), plus dots, arrows and autoplay.
 *
 * Scroll-snap is direction-agnostic, which matters here — under RTL the browser
 * reverses the inline axis, so slide order stays correct without any mirroring
 * maths. Autoplay pauses on hover, on focus, when the tab is hidden, and for
 * anyone who asked for reduced motion.
 */
export function HeroCarousel({ banners }: { banners: Banner[] }) {
  const t = useTranslations("home");
  const locale = useLocale() as Locale;
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const scrollTo = useCallback((index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const slide = track.children[index] as HTMLElement | undefined;
    if (slide) {
      track.scrollTo({ left: slide.offsetLeft, behavior: "smooth" });
    }
  }, []);

  // Derive the active dot from scroll position, so swiping and the controls
  // stay in agreement without a second source of truth.
  const handleScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const { scrollLeft, clientWidth } = track;
    const index = Math.round(Math.abs(scrollLeft) / clientWidth);
    setActive(Math.min(banners.length - 1, Math.max(0, index)));
  }, [banners.length]);

  useEffect(() => {
    if (paused || banners.length < 2) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    const id = window.setInterval(() => {
      if (document.hidden) return;
      setActive((current) => {
        const next = (current + 1) % banners.length;
        scrollTo(next);
        return next;
      });
    }, AUTOPLAY_MS);

    return () => window.clearInterval(id);
  }, [paused, banners.length, scrollTo]);

  if (banners.length === 0) return null;

  const go = (delta: number) => {
    const next = (active + delta + banners.length) % banners.length;
    setActive(next);
    scrollTo(next);
  };

  // Arrows point along the reading direction.
  const PrevIcon = locale === "ar" ? ChevronRight : ChevronLeft;
  const NextIcon = locale === "ar" ? ChevronLeft : ChevronRight;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t("promotions")}
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className={cn(
          "flex snap-x snap-mandatory overflow-x-auto scroll-smooth",
          "gap-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {banners.map((banner, index) => (
          <div
            key={banner.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} / ${banners.length}`}
            aria-hidden={index !== active}
            className="w-full shrink-0 snap-start"
          >
            <HeroBanner
              title={locale === "ar" ? banner.title_ar : banner.title_en}
              subtitle={
                locale === "ar" ? banner.subtitle_ar : banner.subtitle_en
              }
              cta={locale === "ar" ? banner.cta_ar : banner.cta_en}
              href={banner.href}
              imageUrl={banner.image_url}
              priority={index === 0}
            />
          </div>
        ))}
      </div>

      {banners.length > 1 ? (
        <>
          {/* Arrows are supplementary: the dots below are the accessible path,
              and the track itself is keyboard-scrollable. */}
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label={t("previousSlide")}
            className="absolute start-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-text shadow-md transition hover:bg-surface md:inline-flex"
          >
            <PrevIcon className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label={t("nextSlide")}
            className="absolute end-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-text shadow-md transition hover:bg-surface md:inline-flex"
          >
            <NextIcon className="size-5" aria-hidden />
          </button>

          <div className="mt-3 flex items-center justify-center gap-2">
            {banners.map((banner, index) => (
              <button
                key={banner.id}
                type="button"
                onClick={() => {
                  setActive(index);
                  scrollTo(index);
                }}
                aria-label={t("goToSlide", { number: index + 1 })}
                aria-current={index === active}
                className={cn(
                  "h-2 rounded-full transition-all duration-200",
                  index === active
                    ? "w-6 bg-primary-dark"
                    : "w-2 bg-border hover:bg-primary-light",
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
