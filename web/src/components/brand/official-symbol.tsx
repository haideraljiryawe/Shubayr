import Image from "next/image";
import symbol from "@/assets/brand/shubayr-symbol-192.png";
import { cn } from "@/lib/cn";

/**
 * Shubayr's official symbol (NOTE-012), from the app's branding
 * (mobile/assets/images/branding/shubayr-logo.png, copied into src/assets —
 * never loaded from the Flutter tree). Square, contained, never stretched, and
 * its box is reserved so nothing shifts while it loads.
 *
 * `alt` is empty where the name is written right next to it, so a screen
 * reader doesn't hear it twice.
 */
export function OfficialSymbol({
  size,
  alt,
  priority = false,
  className,
}: {
  size: number;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={symbol}
      alt={alt}
      width={size}
      height={size}
      priority={priority}
      sizes={`${size}px`}
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
      data-testid="official-symbol"
    />
  );
}
