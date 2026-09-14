# Account identity and address contact — Mobile handoff

## Implemented in Mobile / Mock

- Account summary reads the active session: avatar fallback, actual name, login
  phone, email (explicit missing states), role, and an Edit profile button.
- Mock login initially has no name or email. Profile edits save those existing
  fields through the repository/session. No identity fixtures were invented.
- `UserAvatar` accepts an `ImageProvider` for future photos and retains the
  initial/person fallback if the image is missing or fails. There is currently
  no photo field or upload/picker implementation; Change photo keeps the existing
  coming-soon behavior and now uses the shared surfaced outlined button.
- Main phone stays read-only. Change explains that future replacement requires
  OTP; it does not request an auth OTP or mutate the session.
- Logout and the existing delete confirmation live together at the bottom of
  Account. Deletion remains coming-soon after confirmation (no endpoint exists).
- Every seeded or newly saved Mock address holds its own actual `contactPhone`.
  Selecting the account phone copies its value at save time. Later account phone
  changes must not rewrite saved addresses. Alternate numbers start empty.
- Phone validation/normalization uses the existing `Validators`. Card badge
  comparison normalizes separators and Arabic digits; it does not infer country
  codes or equate local and international formats.
- Mock addresses remain in the existing in-memory repository. No side storage,
  persistence layer, dependency, auth change, or contract change was introduced.

## Address contract proposal for Backend review

| Item | Required behavior |
| --- | --- |
| Mobile field | `contactPhone` |
| JSON field | `contact_phone` (matches existing snake_case) |
| Type | Phone **string**, never numeric; retain leading zero or `+` |
| Nullability | Required and non-null in every saved Address; reject null/blank/invalid values |
| Create | `POST /addresses` requires `contact_phone` containing the selected actual number, including when it equals the account phone |
| Update | `PATCH /addresses/{id}` replaces the contact when supplied; omission preserves it; null/blank is rejected |
| Responses | Return canonical `contact_phone` in list and all create/update Address responses, including default-address changes |
| Ownership | Address operations retain the current authenticated-user ownership rules |

Backend should define one canonical phone representation and accepted formats,
consistent with account phones, and the validation response for this field.
Existing addresses need a Backend-owned backfill/rollout decision before making
responses non-null. Mobile must not silently substitute an account phone for a
missing address contact. Do not store just `use_primary_phone`: the selection is
presentation state; the persisted data is the phone value.

Until the contract is updated, `contactPhone` is explicitly excluded from current
API JSON serialization. The nullable Dart property represents unsupported legacy
remote data only; Mock rejects missing/invalid contacts on both create and update.
Remote address forms explain the unavailable support and disable saving, and the
remote repository rejects inputs carrying a contact before any HTTP request so
it cannot silently discard it. Existing contact-less contract payloads remain
unchanged. Once Backend supports the field, map `contact_phone` in serialization,
regenerate the serializers, and remove these narrowly scoped guards; there is no
cache or temporary storage to migrate.

## Account phone change capability proposal

These are proposed operations, not existing or implemented routes:

1. Authenticated **request phone change** (for example,
   `POST /me/phone-change/request-otp`): accept `new_phone`; validate format and
   uniqueness, send the OTP to that new number, return an opaque `challenge_id`,
   canonical target number, expiry, and resend cooldown. Keep the current account
   phone unchanged.
2. Authenticated **verify and apply phone change** (for example,
   `POST /me/phone-change/verify`): accept `challenge_id` and `code`; bind the
   challenge to the same signed-in user and target phone, enforce expiry/attempt
   limits and uniqueness, consume it once, and atomically replace the login phone
   only after successful verification. Return the authoritative updated `User`.
3. Define resend/replacement-challenge behavior, error contracts (invalid phone,
   phone already used, invalid/expired OTP, rate limit, expired session), and any
   session/token rotation or invalidation. Return replacement tokens if required
   so Mobile can adopt the server-confirmed state.

Keep this separate from the current sign-in OTP endpoints and `PATCH /me`, which
currently only permits name/email. Failed verification must leave the account
and all existing address contacts unchanged.

## Focused manual review

Run the app normally with `DATA_SOURCE=mock`; this change did not launch a device.

1. Account → Edit profile: add name/email, save and go back; verify summary updates,
   then clear email and verify its explicit missing state. Check the photo button,
   absence of camera overlay, and the read-only phone's Change message.
2. Account → Addresses: add using the primary phone; add using another number;
   switch back before saving; reopen both addresses and check restored selection,
   phone display and the Primary badge. Change the default address and recheck.
3. At the bottom of Account, cancel delete once, then confirm its existing
   coming-soon behavior. Sign out and check return to public home.
4. Repeat relevant screens in Arabic/English and light/dark; inspect the larger
   filter count and the account layout on a phone and a wider window.
