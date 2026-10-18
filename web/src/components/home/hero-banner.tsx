import Image from "next/image";
import { Leaf } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * One promo slide: the rounded dark-green card from the mockup, with the
 * headline, an off-white pill CTA and optional artwork.
 *
 * What it does when pressed follows the data, never a default:
 * - a link and a button label → the pill button opens the link;
 * - a link without a label → the whole card opens it (named by the title);
 * - no link → nothing is clickable and no button is drawn.
 *
 * The artwork is one picture (the Web Admin crops it 2:1). On phones it spans
 * the card above the text at 2:1, cropped by cover only if it isn't 2:1; from
 * `sm` up it sits beside the text, whole (contained). It is never stretched.
 *
 * The CTA is `bg-background` with `text-primary-dark` — that is the cream pill
 * in the mockup, and it also happens to be the highest-contrast pairing on the
 * card (dark ink on cream), so the most important control on the page is the
 * most readable one.
 */
export function HeroBanner({
  title,
  subtitle,
  cta,
  href,
  imageUrl,
  priority = false,
  className,
}: {
  title: string;
  subtitle: string;
  cta: string | null;
  href: string | null;
  imageUrl?: string | null;
  priority?: boolean;
  className?: string;
}) {
  const action = !href ? "none" : cta ? "button" : "card";
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
    >
      {action === "card" && href ? (
        <Link
          href={href}
          aria-label={title}
          className="absolute inset-0 z-20 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white"
          data-testid="hero-card-link"
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
          <h3 className="text-2xl font-bold leading-tight text-white lg:text-4xl">
            {title}
          </h3>
          {subtitle ? (
            <p className="text-lg font-semibold text-white/90 lg:text-2xl">
              {subtitle}
            </p>
          ) : null}

          {action === "button" && href ? (
            <Link
              href={href}
              className={buttonClasses({
                size: "lg",
                className:
                  "mt-2 bg-background text-primary-dark shadow-md hover:bg-card",
              })}
              data-testid="hero-cta"
            >
              {cta}
            </Link>
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
