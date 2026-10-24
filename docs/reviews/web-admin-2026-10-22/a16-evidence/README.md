# A16 evidence — permission names, product delete, change password

Screenshots for PR A16 (Ahmed's visual review, part 4), taken by
`admin/tests/visual/a16.spec.ts` against a throwaway seeded database
(`shubayr_a16_verify`) at contract 17.10.0. Each shot exists in Arabic and
English (`.ar` / `.en`) at 1440 px (`wide`) and 390 px (`narrow`); the spec
asserts the rule before it photographs it, and that no page scrolls sideways.

| Shot | Item | What it shows |
| --- | --- | --- |
| `permissions` | VIS-019 | The orders group of the preset picker: names and descriptions in the interface language from the registry, the key as a small hint. |
| `permissions-search` | VIS-019 | A search in that language (Arabic typed without hamza: «اسعار» finds «تغيير أسعار البيع»). |
| `staff-grants` | VIS-019 | The staff editor's extra grants, same names. |
| `product-delete-action` | Product delete | “Delete product / حذف المنتج” in the product page header. |
| `product-delete-confirm` | Product delete | The confirmation explaining delete (never used) vs archive (has history) and why. |
| `product-archived` | Product delete | A product with stock was archived; the reason is listed. |
| `bulk-bar`, `bulk-delete-confirm`, `bulk-delete-outcome` | Product delete | Bulk delete of two products: one deleted, one archived with its reason. |
| `products-list` | Product delete | The list with the status filter on “All except archived”. |
| `change-password` | Change password | Shared password fields with show/hide (the toggle at the field's end in both directions), the live localized checklist, the way back to the page you came from. |

Re-run: `cd admin && ADMIN_LIVE_API=http://localhost:8000/api/v1 npx playwright test --config playwright.visual.config.ts tests/visual/a16.spec.ts`
