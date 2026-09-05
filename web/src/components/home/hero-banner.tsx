import Image from "next/image";
import { Leaf } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * One promo slide: the rounded dark-green card from the mockup, with the
 * headline, an off-white pill CTA and optional artwork.
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
  cta: string;
  href: string;
  imageUrl?: string | null;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-lg",
        "bg-gradient-to-bl from-primary to-primary-dark",
        "min-h-52 sm:min-h-60 lg:min-h-72",
        className,
      )}
    >
      {/* Decorative foliage, echoing the mockup. Purely ornamental. */}
      <Leaf
        className="pointer-events-none absolute -bottom-10 start-1/4 size-28 -rotate-12 text-white/5 lg:size-44"
        aria-hidden
      />

      {/* md:px-20 keeps the copy clear of the carousel arrows, which are
          overlaid on the inline edges — in RTL the prev arrow lands on the same
          side as the text. */}
      <div className="relative z-10 flex h-full items-center gap-6 p-6 md:px-20 lg:p-10 lg:px-24">
        <div className="flex max-w-md flex-col items-start gap-3 lg:gap-4">
          <h3 className="text-2xl font-bold leading-tight text-white lg:text-4xl">
            {title}
          </h3>
          <p className="text-lg font-semibold text-white/90 lg:text-2xl">
            {subtitle}
          </p>

          <Link
            href={href}
            className={buttonClasses({
              size: "lg",
              className:
                "mt-2 bg-background text-primary-dark shadow-md hover:bg-card",
            })}
          >
            {cta}
          </Link>
        </div>

        {/* The mockup fills the opposite half with product artwork. Until the
            catalog supplies banner images, a soft medallion keeps the desktop
            composition balanced instead of leaving half the card empty. */}
        <div className="relative ms-auto hidden shrink-0 items-center justify-center sm:flex">
          {imageUrl ? (
            <div className="relative h-40 w-48 lg:h-56 lg:w-72">
              <Image
                src={imageUrl}
                alt=""
                fill
                sizes="(min-width: 1024px) 18rem, 12rem"
                priority={priority}
                className="object-contain"
              />
            </div>
          ) : (
            <span
              className="flex size-36 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15 lg:size-52"
              aria-hidden
            >
              <Leaf className="size-16 text-white/40 lg:size-24" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
