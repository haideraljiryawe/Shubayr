import {
  Bell,
  CreditCard,
  Globe,
  Heart,
  HelpCircle,
  MapPin,
  Package,
  Settings,
  User,
  type LucideIcon,
} from "lucide-react";

/**
 * The «حسابي» menu from the mockup, in its order.
 *
 * `built` marks what this phase implements; everything else is a real menu row
 * that lands on a placeholder page, so the account screen is complete from the
 * start and filling a section later is a route change, not a redesign.
 */
export interface AccountMenuItem {
  /** Key inside the `account` message namespace, and the URL segment. */
  key:
    | "orders"
    | "addresses"
    | "profile"
    | "wishlist"
    | "payments"
    | "notifications"
    | "language"
    | "help"
    | "settings";
  icon: LucideIcon;
  built: boolean;
}

export const ACCOUNT_MENU: AccountMenuItem[] = [
  { key: "orders", icon: Package, built: true },
  { key: "addresses", icon: MapPin, built: true },
  { key: "profile", icon: User, built: true },
  { key: "wishlist", icon: Heart, built: false },
  { key: "payments", icon: CreditCard, built: false },
  { key: "notifications", icon: Bell, built: false },
  { key: "language", icon: Globe, built: false },
  { key: "help", icon: HelpCircle, built: false },
  { key: "settings", icon: Settings, built: false },
];

/** Sections that resolve to the "coming soon" placeholder route. */
export const PLACEHOLDER_SECTIONS = ACCOUNT_MENU.filter(
  (item) => !item.built,
).map((item) => item.key);

export function accountHref(key: AccountMenuItem["key"]): string {
  return `/account/${key}`;
}
