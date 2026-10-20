import Image from "next/image";
import symbol from "@/assets/brand/shubayr-symbol-192.png";

/**
 * Shubayr's official symbol (NOTE-012), copied from the app's branding into
 * src/assets (never loaded from the Flutter tree): square, contained, its box
 * reserved. `alt` is empty where the name is written beside it.
 */
export function OfficialSymbol({ size, alt = "", priority = false, className }: { size: number; alt?: string; priority?: boolean; className?: string }) {
  return (
    <Image
      src={symbol}
      alt={alt}
      width={size}
      height={size}
      priority={priority}
      sizes={`${size}px`}
      className={`shrink-0 object-contain ${className ?? ""}`}
      style={{ width: size, height: size }}
      data-testid="official-symbol"
    />
  );
}
