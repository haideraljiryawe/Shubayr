import {
  Grid2x2,
  Heart,
  Home,
  ShoppingCart,
  User,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  /** Key inside the `nav` message namespace. */
  key: "home" | "categories" | "cart" | "wishlist" | "account";
  href: string;
  icon: LucideIcon;
}

/**
 * Shared between the desktop top nav and the mobile bottom tab bar, in the same
 * order as the mockup: الرئيسية · الأقسام · السلة · المفضلة · حسابي.
 * Phase 1 has no real pages yet, so everything points at `/`.
 */
export const NAV_ITEMS: NavItem[] = [
  { key: "home", href: "/", icon: Home },
  { key: "categories", href: "/", icon: Grid2x2 },
  { key: "cart", href: "/", icon: ShoppingCart },
  { key: "wishlist", href: "/", icon: Heart },
  { key: "account", href: "/", icon: User },
];
