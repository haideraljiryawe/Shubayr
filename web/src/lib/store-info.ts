import type { StoreSettings } from "./api";

/* ---------------------------------------------------------------------------
 * The store's legal, contact and policy details, from GET /settings (contract
 * 17.2). The owner fills them in from the Web Admin (Settings → Store info).
 *
 * Every field may be null — a value the owner hasn't entered yet — and stays
 * null here: the pages hide that line or say something neutral instead, and
 * never invent a placeholder. A failed settings read (the API briefly
 * unavailable) gives the same all-null info, so nothing crashes.
 * ------------------------------------------------------------------------- */

export interface Bilingual {
  ar: string | null;
  en: string | null;
}

export interface StoreInfo {
  legalName: Bilingual;
  address: Bilingual;
  hours: Bilingual;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  privacyEmail: string | null;
  /** Days after delivery to ask for a return (the server's own eligibility rule). */
  returnWindowDays: number | null;
  /** Days to refund an accepted return. */
  refundDays: number | null;
  /** YYYY-MM-DD the current policies take effect. */
  policyDate: string | null;
}

const E164 = /^\+[1-9]\d{7,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function matching(value: unknown, pattern: RegExp): string | null {
  const cleaned = text(value);
  return cleaned && pattern.test(cleaned) ? cleaned : null;
}

function whole(value: unknown, minimum: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum ? value : null;
}

/** The info in a settings answer; anything missing, blank or malformed is null. */
export function storeInfoFrom(settings: Partial<StoreSettings> | null | undefined): StoreInfo {
  const s = settings ?? {};
  return {
    legalName: { ar: text(s.store_legal_name_ar), en: text(s.store_legal_name_en) },
    address: { ar: text(s.store_address_ar), en: text(s.store_address_en) },
    hours: { ar: text(s.support_hours_ar), en: text(s.support_hours_en) },
    phone: matching(s.support_phone, E164),
    whatsapp: matching(s.support_whatsapp, E164),
    email: matching(s.support_email, EMAIL),
    privacyEmail: matching(s.privacy_email, EMAIL),
    returnWindowDays: whole(s.return_window_days, 1),
    refundDays: whole(s.refund_days, 0),
    policyDate: matching(s.policy_effective_date, DAY),
  };
}

export const EMPTY_STORE_INFO: StoreInfo = storeInfoFrom(null);

/**
 * A bilingual value in the page's language, falling back to the other one —
 * an address entered only in Arabic is still the address — or null.
 */
export function inLocale(value: Bilingual, locale: string): string | null {
  return locale === "en" ? (value.en ?? value.ar) : (value.ar ?? value.en);
}

/** "+9647700000000" → "tel:+9647700000000". */
export function telLink(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, "")}`;
}

/** "+9647700000000" → "https://wa.me/9647700000000". */
export function whatsappLink(number: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}`;
}

/** Whether there is any way at all to reach the store. */
export function hasContact(info: StoreInfo): boolean {
  return Boolean(info.phone || info.whatsapp || info.email);
}
