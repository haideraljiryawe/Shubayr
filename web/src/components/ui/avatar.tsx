import { User } from "lucide-react";
import { cn } from "@/lib/cn";

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
  xl: "size-16 text-xl",
} as const;

/** Initials-or-icon avatar; `src` renders the real image when one exists. */
export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name?: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const initials = name
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center overflow-hidden rounded-full",
        "bg-primary-light/40 text-primary-dark font-semibold select-none",
        SIZES[size],
        className,
      )}
    >
      {src ? (
        // Plain <img>: avatars are tiny, remote and not worth an optimizer hop.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ?? ""} className="size-full object-cover" />
      ) : initials ? (
        initials
      ) : (
        <User className="size-1/2" aria-hidden />
      )}
    </span>
  );
}
