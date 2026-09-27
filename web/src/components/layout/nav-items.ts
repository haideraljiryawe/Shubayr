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
 * Wishlist opens the saved-products page (behind the account guard).
 */
export const NAV_ITEMS: NavItem[] = [
  { key: "home", href: "/", icon: Home },
  { key: "categories", href: "/categories", icon: Grid2x2 },
  { key: "cart", href: "/cart", icon: ShoppingCart },
  { key: "wishlist", href: "/account/wishlist", icon: Heart },
  { key: "account", href: "/account", icon: User },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.key === "categories") {
    return pathname === "/categories" || pathname.startsWith("/category/");
  }
  if (item.key === "home") return pathname === "/";
  return item.href !== "/" && pathname === item.href;
}
