import {
  Bell,
  CreditCard,
  Globe,
  Heart,
  HelpCircle,
  MapPin,
  Package,
  RotateCcw,
  Settings,
  Sparkles,
  User,
  type LucideIcon,
} from "lucide-react";

/**
 * The «حسابي» menu from the mockup, in its order.
 *
 * Every row is a real page: Phase 6A built orders, addresses and profile, and
 * 6B filled the rest, so the "coming soon" placeholder route is gone.
 */
export interface AccountMenuItem {
  /** Key inside the `account` message namespace, and the URL segment. */
  key:
    | "orders"
    | "returns"
    | "addresses"
    | "profile"
    | "wishlist"
    | "points"
    | "payments"
    | "notifications"
    | "language"
    | "help"
    | "settings";
  icon: LucideIcon;
}

export const ACCOUNT_MENU: AccountMenuItem[] = [
  { key: "orders", icon: Package },
  { key: "returns", icon: RotateCcw },
  { key: "addresses", icon: MapPin },
  { key: "profile", icon: User },
  { key: "wishlist", icon: Heart },
  { key: "points", icon: Sparkles },
  { key: "payments", icon: CreditCard },
  { key: "notifications", icon: Bell },
  { key: "language", icon: Globe },
  { key: "help", icon: HelpCircle },
  { key: "settings", icon: Settings },
];

export function accountHref(key: AccountMenuItem["key"]): string {
  return `/account/${key}`;
}
