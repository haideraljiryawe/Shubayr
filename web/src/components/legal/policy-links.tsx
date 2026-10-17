import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * The legal and support pages, in the footer of every page, on the "opening
 * soon" page and in the account's help. All of them open even while the store
 * is closed (src/lib/store-gate.ts, INFO_PATHS).
 */
export const POLICY_LINKS = [
  { key: "privacy", href: "/privacy" },
  { key: "terms", href: "/terms" },
  { key: "returns", href: "/returns" },
  { key: "support", href: "/support" },
  { key: "deleteAccount", href: "/account/delete" },
] as const;

export type PolicyLinkKey = (typeof POLICY_LINKS)[number]["key"];

export function PolicyLinks({
  only,
  className,
}: {
  /** A subset, in POLICY_LINKS order; all of them when omitted. */
  only?: readonly PolicyLinkKey[];
  className?: string;
}) {
  const t = useTranslations("legal");
  const links = only ? POLICY_LINKS.filter((link) => only.includes(link.key)) : POLICY_LINKS;

  return (
    <nav aria-label={t("linksLabel")} className={className}>
      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm md:justify-start">
        {links.map((link) => (
          <li key={link.key}>
            <Link
              href={link.href}
              data-testid={`policy-link-${link.key}`}
              className={cn("text-text-muted underline-offset-4 transition-colors hover:text-primary-dark hover:underline")}
            >
              {t(link.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
