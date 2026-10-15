"use client";

import { useSyncExternalStore } from "react";

/* ---------------------------------------------------------------------------
 * Where the shopper means the order to go, as far as pricing goes (API 16.2):
 * a governorate (guests, or a signed-in shopper without a saved address), or
 * one of the signed-in shopper's saved addresses. The cart and checkout read
 * and write the same choice, so the delivery fee — and the total — the cart
 * shows is the one checkout starts from. Kept on this device only.
 * ------------------------------------------------------------------------- */

export interface DeliveryLocation {
  governorateId: string | null;
  addressId: string | null;
}

const KEY = "shubayr.delivery-location.v1";
const EMPTY: DeliveryLocation = { governorateId: null, addressId: null };
const listeners = new Set<() => void>();
let current: DeliveryLocation | null = null;

function read(): DeliveryLocation {
  if (current) return current;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<DeliveryLocation> | null;
    current = {
      governorateId: typeof parsed?.governorateId === "string" ? parsed.governorateId : null,
      addressId: typeof parsed?.addressId === "string" ? parsed.addressId : null,
    };
  } catch {
    current = EMPTY;
  }
  return current;
}

export const deliveryLocation = {
  get: read,
  /** Choose a governorate (forgets any saved address). */
  setGovernorate(governorateId: string | null): void {
    deliveryLocation.set({ governorateId, addressId: null });
  },
  /** Choose a saved address; its governorate is remembered for when signed out. */
  setAddress(addressId: string | null, governorateId: string | null): void {
    deliveryLocation.set({ addressId, governorateId: governorateId ?? read().governorateId });
  },
  set(next: DeliveryLocation): void {
    const before = read();
    if (before.governorateId === next.governorateId && before.addressId === next.addressId) return;
    current = next;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Private mode: the choice lasts for this page only.
    }
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useDeliveryLocation(): DeliveryLocation {
  return useSyncExternalStore(deliveryLocation.subscribe, read, () => EMPTY);
}
