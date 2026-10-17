# App store URLs

The web addresses to enter in App Store Connect (Apple) and the Google Play Console for the Shubayr apps.

Replace `<domain>` with the store's production domain: the same `<domain>` as in [deploy/production.md](../deploy/production.md), for example `shubayr.iq`.

> **Before submitting:** the policy texts are **drafts**. The owner, and a lawyer if possible, must review them and fill in the store details first. See [legal-pages.md](legal-pages.md).

| What the store asks for | URL | Where it goes |
|---|---|---|
| Privacy policy | `https://<domain>/privacy` | **Apple:** App Store Connect → App Privacy → Privacy Policy URL.<br>**Google:** Play Console → Policy → App content → Privacy policy. Also on the store listing. |
| Terms of use | `https://<domain>/terms` | **Apple:** App Information → License Agreement (custom EULA), or in the app description.<br>**Google:** store listing description (optional). |
| Support | `https://<domain>/support` | **Apple:** Version → Support URL (required).<br>**Google:** Store settings → Store listing contact details → Website. |
| Account deletion | `https://<domain>/account/delete` | **Google:** Play Console → Policy → App content → Data safety → "Delete account URL" (required, because the app creates accounts).<br>**Apple:** the app must also offer deletion inside the app (guideline 5.1.1(v)). This URL can be given in the review notes. |
| Returns & refunds (optional) | `https://<domain>/returns` | Store listing description or the support page, if wanted. |

The Arabic page is at the bare path. The English version of each page is under `/en`:

- `https://<domain>/en/privacy`
- `https://<domain>/en/terms`
- `https://<domain>/en/support`
- `https://<domain>/en/account/delete`
- `https://<domain>/en/returns`

## They work before the store opens

All of these pages open even while the store is in "opening soon" mode (`STORE_PUBLIC=false`), so the apps can be submitted before opening day.

- In "opening soon" mode, the pages carry `noindex` and search engines don't list them.
- Once the store is public, they are indexed and listed in `sitemap.xml`.
- The account deletion page works in both modes: a signed-out visitor signs in on the page itself with their phone and code.

## Check before submitting

- [ ] Each URL above opens over `https://`, in Arabic and in English.
- [ ] The support page shows the real phone, WhatsApp, e-mail and hours.
- [ ] Signing in on `/account/delete` with a test customer and confirming deletes the account and signs the customer out.
  - Use a customer with no open orders, no pending returns and no unsettled amounts; otherwise the page lists those reasons and nothing is deleted.
- [ ] The Data safety form (Google) and App Privacy answers (Apple) match the privacy policy. It lists the data collected: phone number, name, delivery addresses, order history and device push tokens. None of this data is sold, and order and financial records are kept after deletion, anonymized.
