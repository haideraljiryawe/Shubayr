import Image from "next/image";
import type { ReactNode } from "react";
import { Leaf } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { BannerTarget } from "@/lib/banners";
import { cn } from "@/lib/cn";

/**
 * One promo slide (NOTE-001).
 *
 * With text (`show_text`): the rounded dark-green card from the mockup — the
 * headline, an optional subtitle, an off-white pill button and the artwork.
 * Image-only (`show_text` off): the artwork fills the card at 2:1, with no
 * text drawn over it; its title stays as the slide's accessible name.
 *
 * What it does when pressed follows the banner's action, never a default:
 * - an action and a button label → the pill button opens it;
 * - an action without a label (or an image-only banner) → the whole card does;
 * - no action → nothing is clickable and no button is drawn.
 * A store page opens in the current language; another site opens in a new tab
 * that cannot reach back into this one (rel="noopener noreferrer").
 *
 * The artwork is never stretched. If it fails to load, `onImageError` tells
 * the carousel, which drops the slide instead of showing a broken picture.
 */
export function HeroBanner({
  title,
  subtitle,
  cta,
  target,
  showText,
  imageUrl,
  priority = false,
  onImageError,
  className,
}: {
  title: string;
  subtitle: string;
  cta: string | null;
  target: BannerTarget;
  showText: boolean;
  imageUrl?: string | null;
  priority?: boolean;
  onImageError?: () => void;
  className?: string;
}) {
  const clickable = target.kind !== "none";
  const action = !clickable ? "none" : showText && cta ? "button" : "card";

  if (!showText && imageUrl) {
    return (
      <div
        className={cn("relative isolate aspect-[2/1] overflow-hidden rounded-lg bg-card", className)}
        data-testid="hero-banner"
        data-action={action}
        data-show-text="false"
        data-target={targetKey(target)}
      >
        <Image
          src={imageUrl}
          alt={clickable ? "" : title}
          fill
          sizes="(min-width: 1280px) 80rem, 100vw"
          priority={priority}
          className="object-cover"
          onError={onImageError}
          data-testid="hero-art"
        />
        {clickable ? (
          <BannerLink target={target} ariaLabel={title} className="absolute inset-0 z-20 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white" testId="hero-card-link" />
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-lg",
        "bg-gradient-to-bl from-primary to-primary-dark",
        "min-h-52 sm:min-h-60 lg:min-h-72",
        className,
      )}
      data-testid="hero-banner"
      data-action={action}
      data-show-text="true"
      data-target={targetKey(target)}
    >
      {action === "card" ? (
        <BannerLink
          target={target}
          ariaLabel={title}
          className="absolute inset-0 z-20 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white"
          testId="hero-card-link"
        />
      ) : null}

      {/* Decorative foliage, echoing the mockup. Purely ornamental. */}
      <Leaf
        className="pointer-events-none absolute -bottom-10 start-1/4 size-28 -rotate-12 text-white/5 lg:size-44"
        aria-hidden
      />

      {/* md:px-20 keeps the copy clear of the carousel arrows, which are
          overlaid on the inline edges — in RTL the prev arrow lands on the same
          side as the text. */}
      <div className="relative z-10 flex h-full flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-6 md:px-20 lg:p-10 lg:px-24">
        <div className="flex max-w-md flex-col items-start gap-3 lg:gap-4">
          <h3 className="line-clamp-2 text-2xl font-bold leading-tight text-white lg:text-4xl" data-testid="hero-title">
            {title}
          </h3>
          {subtitle ? (
            <p className="line-clamp-2 text-lg font-semibold text-white/90 lg:text-2xl" data-testid="hero-subtitle">
              {subtitle}
            </p>
          ) : null}

          {action === "button" ? (
            <BannerLink
              target={target}
              className={buttonClasses({
                size: "lg",
                className: "mt-2 bg-background text-primary-dark shadow-md hover:bg-card",
              })}
              testId="hero-cta"
            >
              {cta}
            </BannerLink>
          ) : null}
        </div>

        {imageUrl ? (
          <div
            className="relative order-first aspect-[2/1] w-full shrink-0 overflow-hidden rounded-md sm:order-none sm:ms-auto sm:w-56 sm:rounded-none lg:w-96"
            data-testid="hero-art"
          >
            <Image
              src={imageUrl}
              alt=""
              fill
              sizes="(min-width: 1024px) 24rem, (min-width: 640px) 14rem, 100vw"
              priority={priority}
              className="object-cover sm:object-contain"
              onError={onImageError}
            />
          </div>
        ) : (
          // The mockup fills the opposite half with artwork; without a picture
          // a soft medallion keeps the wider composition balanced. Phones skip
          // it so the text isn't pushed down by an ornament.
          <div className="relative ms-auto hidden shrink-0 items-center justify-center sm:flex">
            <span
              className="flex size-36 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15 lg:size-52"
              aria-hidden
            >
              <Leaf className="size-16 text-white/40 lg:size-24" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function targetKey(target: BannerTarget): string {
  return target.kind === "none" ? "none" : target.kind === "external" ? `external:${target.url}` : `internal:${target.path}`;
}

/** A store page through the localized Link; another site in a new, isolated tab. */
function BannerLink({
  target,
  ariaLabel,
  className,
  testId,
  children,
}: {
  target: BannerTarget;
  ariaLabel?: string;
  className?: string;
  testId: string;
  children?: ReactNode;
}) {
  if (target.kind === "external") {
    return (
      <a href={target.url} target="_blank" rel="noopener noreferrer" aria-label={ariaLabel} className={className} data-testid={testId}>
        {children}
      </a>
    );
  }
  if (target.kind === "internal") {
    return (
      <Link href={target.path} aria-label={ariaLabel} className={className} data-testid={testId}>
        {children}
      </Link>
    );
  }
  return null;
}
