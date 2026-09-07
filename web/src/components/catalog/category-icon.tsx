import {
  BookOpen,
  Drill,
  Dumbbell,
  Gamepad2,
  Headphones,
  Laptop,
  Package,
  Shirt,
  Smartphone,
  Sofa,
  Sparkles,
  Watch,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

// Keep the explicit icon allowlist so category data cannot pull the entire
// lucide library into the bundle. Unknown icons retain a useful fallback.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  BookOpen,
  Drill,
  Dumbbell,
  Gamepad2,
  Headphones,
  Laptop,
  Shirt,
  Smartphone,
  Sofa,
  Sparkles,
  Watch,
};

export function CategoryIcon({
  name,
  className,
}: {
  name?: string | null;
  className?: string;
}) {
  const Icon = (name && CATEGORY_ICONS[name]) || Package;

  return (
    <Icon
      className={cn("size-12 text-primary-dark", className)}
      strokeWidth={1.5}
      aria-hidden
    />
  );
}
