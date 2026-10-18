# Legal and support pages

> **DRAFT: not legal advice.** The privacy policy, terms of use and returns & refunds policy are first drafts written for this store. The owner, and preferably a lawyer familiar with Iraqi law, must review them before launch and before the app store submissions ([store-urls.md](store-urls.md)). The pages themselves show no "draft" notice: what is published is what customers read.

## The pages

All of them are in Arabic (the bare path) and English (`/en/...`), linked from the footer of every page, and open even in "opening soon" mode.

| Page | Path | Content |
|---|---|---|
| Privacy policy | `/privacy` | `web/src/content/legal.ts` → `privacy()` |
| Terms of use | `/terms` | `web/src/content/legal.ts` → `terms()` |
| Returns & refunds | `/returns` | `web/src/content/legal.ts` → `returns()` |
| Contact us | `/support` | `web/src/app/[locale]/support/page.tsx`, with its values from the config file |
| Delete account | `/account/delete` | Wording in `web/src/messages/{ar,en}.json` → `deleteAccount` |

## Change the store details in the Web Admin

The owner fills in every store-specific value in the **Web Admin → Settings → Store info** (permission `settings.manage`). They are saved in the API's settings and published through `GET /settings` (contract 17.2), so the store and the apps follow at once. There is no rebuild, and the store's settings cache refreshes within a minute.

| Field | Used on |
|---|---|
| Legal name (Arabic and English) | privacy, terms, support |
| Registered address (Arabic and English) | privacy, terms, support |
| Support phone, WhatsApp, support e-mail | support, returns, account deletion, the account's help page, the footer (phone and e-mail) |
| Privacy e-mail | privacy, support (when empty, privacy requests go to the support e-mail) |
| Support hours (Arabic and English) | support, the account's help page |
| Return window (days), refund within (days) | returns, the account's help FAQ. The return window is also the server's eligibility rule: it can be changed, never left empty |
| Policies effective from | the "Last updated" line on privacy, terms and returns |

**An empty field is never shown as a placeholder.** The page hides that line (a missing WhatsApp number is simply not listed) or uses a neutral sentence ("within the return period the store sets", "reach us through the Contact us page"). The same happens if the API is briefly unreachable: the pages still open. A value in only one language is shown in both.

The store's display name and logo come from the same settings. The policies use the display name for "we" and the legal name for the responsible business; until a legal name is entered, the display name stands in.

## What the owner/lawyer must confirm

**Privacy policy**
- The data listed is what the store collects: phone number, name, delivery addresses with an optional map location, orders and returns, device push tokens, IP/request logs. Add anything else the business collects, such as call recordings.
- Who data is shared with: delivery staff/partners, hosting, SMS and push providers. Name the providers if the lawyer advises it.
- Retention after deletion: personal identity is removed, while order, return, payment and accounting records are kept, anonymized, "for as long as the law requires". Confirm the period that applies, for example the Iraqi tax/commercial record-keeping period, and whether to state it.
- The privacy contact (Store info → Privacy e-mail).

**Terms of use**
- Orders are confirmed by a phone call, payment is cash on delivery, delivery fees depend on the governorate, and prices and stock can change.
- Automatic discounts and coupons, and how they combine (the cart shows it).
- Cancellation rules, the liability limits and the governing law (Republic of Iraq).

**Returns & refunds: these rules are placeholders to confirm**
- The return window: Store info → Return window (the server's setting; 14 days unless changed).
- The product condition: unused, original packaging, all accessories. Hygiene and food items are not returnable unless faulty.
- Faulty or wrong items: a replacement or a full refund including the delivery fee.
- The refund time: Store info → Refund within (days), after the return is accepted, in cash. The delivery fee is refunded only if the item was faulty or the store made a mistake.
- A partial return refunds each item at its price after the order's discounts are shared across the items. This is how the system calculates it.
- Who collects the returned item, and how.

**Support**
- The real phone, WhatsApp and e-mail, and the hours.

## Where this is enforced

- The pages bypass the "opening soon" gate: `INFO_PATHS` in `web/src/lib/store-gate.ts`.
  - With `STORE_PUBLIC=false`, they render in a small shell with the logo, the language switch and the footer, plus `noindex`.
  - When the store is public, they are indexed and listed in `sitemap.xml`. `robots.txt` allows `/account/delete` even though the rest of `/account` is disallowed.
- Account deletion calls `DELETE /api/v1/me/account` ([../ACCOUNT_DELETION.md](../ACCOUNT_DELETION.md)). The page lists the API's refusal reasons (`OPEN_ORDERS`, `PENDING_RETURNS`, `UNSETTLED_AMOUNTS`), each linking to where it can be finished. On success it signs the customer out.
