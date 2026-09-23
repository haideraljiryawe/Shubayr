import {
  BookOpen,
  Car,
  Drill,
  Dumbbell,
  Gamepad2,
  Headphones,
  Laptop,
  Package,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sofa,
  Sparkles,
  Watch,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Semantic `icon_key` from the contract mapped to a lucide glyph.
 *
 * The key is deliberately not a framework icon name — the contract says so —
 * so a department keeps its meaning across web, mobile and admin while each
 * renders whatever its own icon set provides. The allowlist is explicit so
 * category data cannot pull the entire lucide library into the bundle, and an
 * unknown key falls back to a neutral parcel rather than rendering nothing.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  electronics: Smartphone,
  home_garden: Sofa,
  fashion: Shirt,
  grocery: ShoppingBasket,
  beauty: Sparkles,
  sports: Dumbbell,
  automotive: Car,
  books: BookOpen,
  // Keys the storefront also renders from older fixtures.
  audio: Headphones,
  computers: Laptop,
  gaming: Gamepad2,
  tools: Drill,
  watches: Watch,
};

export function CategoryIcon({
  iconKey,
  className,
}: {
  /** The contract's semantic `icon_key`, e.g. "home_garden". */
  iconKey?: string | null;
  className?: string;
}) {
  const Icon = (iconKey && CATEGORY_ICONS[iconKey]) || Package;

  return (
    <Icon
      className={cn("size-12 text-primary-dark", className)}
      strokeWidth={1.5}
      aria-hidden
    />
  );
}
