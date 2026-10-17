/* ---------------------------------------------------------------------------
 * Everything store-specific the legal and support pages say, in ONE place
 * (docs/launch/legal-pages.md). Change a value here and every page — privacy,
 * terms, returns, support, account deletion, the account help panel and the
 * footer — follows. The store's display name and logo still come from the
 * API's store settings (the white-label theme); `legalName` is the business
 * entity that is responsible in law.
 *
 * Values in [brackets] are PLACEHOLDERS for the owner to replace before
 * launch. The policy texts themselves (src/content/legal.ts) are DRAFTS for
 * the owner's and a lawyer's review.
 * ------------------------------------------------------------------------- */

export interface Bilingual {
  ar: string;
  en: string;
}

export const STORE_INFO = {
  /** The responsible business, as registered. */
  legalName: { ar: "[الاسم القانوني للمتجر]", en: "[Store legal name]" } as Bilingual,
  /** Registered address. */
  address: { ar: "[العنوان المسجّل، المدينة، العراق]", en: "[Registered address, City, Iraq]" } as Bilingual,
  /** Customer support: phone (also the WhatsApp number unless set), e-mail. */
  phone: "+9647700000000",
  whatsapp: "+9647700000000",
  email: "support@shubayr.example",
  /** Where privacy requests go (access, correction, deletion help). */
  privacyEmail: "privacy@shubayr.example",
  /** When the phone and WhatsApp lines are answered (Baghdad time). */
  hours: { ar: "السبت إلى الخميس، من ٩ صباحًا حتى ٩ مساءً (بتوقيت بغداد)", en: "Saturday to Thursday, 9 am to 9 pm (Baghdad time)" } as Bilingual,
  /** Placeholder rule for the owner to confirm: days after delivery to ask for a return. */
  returnWindowDays: 7,
  /** Placeholder rule for the owner to confirm: days to refund an accepted return. */
  refundDays: 7,
  /** The date the current policy texts take effect (YYYY-MM-DD). */
  policiesUpdated: "2026-10-17",
} as const;

/** "+9647700000000" → "https://wa.me/9647700000000". */
export function whatsappLink(number: string = STORE_INFO.whatsapp): string {
  return `https://wa.me/${number.replace(/[^\d]/g, "")}`;
}

export function telLink(number: string = STORE_INFO.phone): string {
  return `tel:${number.replace(/[^\d+]/g, "")}`;
}
