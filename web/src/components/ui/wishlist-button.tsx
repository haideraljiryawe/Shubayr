"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Heart } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "./icon-button";

const STORAGE_KEY = "shubayr:wishlist";
const listeners = new Set<() => void>();
let wishlist = new Set<string>();
let initialized = false;

function parseWishlist(value: string | null): Set<string> {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function readWishlist() {
  if (!initialized) {
    initialized = true;
    try {
      wishlist = parseWishlist(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      // In private/blocked storage, the shared in-memory wishlist still works.
    }
  }
  return wishlist;
}

function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  wishlist = parseWishlist(event.newValue);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    // Refresh after a navigation with no mounted product cards.
    initialized = false;
    window.addEventListener("storage", onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function updateWishlist(productId: string, active: boolean) {
  const next = new Set(readWishlist());
  if (active) next.add(productId);
  else next.delete(productId);
  wishlist = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  } catch {
    // Keep the optimistic local state if browser storage is unavailable.
  }
  listeners.forEach((listener) => listener());
}

/** Product hearts share browser-local state; standalone examples stay local. */
export function WishlistButton({
  productId,
  active,
  defaultActive = false,
  onToggle,
  size = "md",
  className,
}: {
  productId?: string;
  active?: boolean;
  defaultActive?: boolean;
  onToggle?: (next: boolean) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const t = useTranslations("common");
  const [internal, setInternal] = useState(defaultActive);
  const saved = useSyncExternalStore(
    subscribe,
    () => Boolean(productId && readWishlist().has(productId)),
    () => defaultActive,
  );
  const isActive = active ?? (productId ? saved : internal);

  return (
    <IconButton
      label={t(isActive ? "removeFromWishlist" : "addToWishlist")}
      aria-pressed={isActive}
      size={size}
      onClick={() => {
        const next = !isActive;
        if (active === undefined) {
          if (productId) updateWishlist(productId, next);
          else setInternal(next);
        }
        onToggle?.(next);
      }}
      className={cn("shadow-sm", className)}
    >
      <Heart
        className={cn(
          "size-4.5 transition-colors",
          isActive ? "fill-error text-error" : "text-text-muted",
        )}
        aria-hidden
      />
    </IconButton>
  );
}
