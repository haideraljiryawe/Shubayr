# A14b: type sizes, before and after

Ten admin pages in Arabic and English at 1440 px, full page. `before/` is main at
46a1c93 (A14); `after/` is the A14b branch. Both were taken from the same seeded,
throwaway database, signed in as the development admin.

| Shot | Page |
|---|---|
| home | `/?period=month` |
| products | `/catalog/products` |
| product-new | `/catalog/products/new` |
| banners | `/catalog/banners` |
| orders | `/orders` |
| order-detail | the first order on `/orders` |
| stock | `/inventory/stock` |
| invoice-new | `/purchasing/invoices/new` |
| store-info | `/settings/store-info` |
| reports | `/reports` |

What changes between the two:

- **Raw sizes now use the roles.** Text that used `text-xs`, `text-sm`, `text-lg` or
  `text-xl` now uses `text-caption`, `text-body`/`text-label`, `text-section` or
  `text-page-title`. The size is mostly unchanged; the roles bring their own line
  height, so some pages are a few pixels taller or shorter. Former `text-base`/`text-lg`
  headings are now 18 px.
- **The roles the A13/A14 components already used now apply.** Before, `cn()` dropped a
  role such as `text-label` whenever a text colour followed it, so that text fell back to
  the 16 px default. This shows most in the English orders list. The sidebar links, tabs,
  table cells, status badges and the version line now have their intended sizes
  (14 px, 13 px table heads, 12 px badges and captions), and the list gets 220 px shorter.

Nothing else differs: same pages, data, layout and behaviour.
