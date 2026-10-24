# A17 evidence — account-menu role, delete preview, real bulk delete

Screenshots for PR A17 (Ahmed's visual review, final part), taken by
`admin/tests/visual/a17.spec.ts` against a throwaway seeded database
(`shubayr_a17_verify`) at contract 17.12.0. Each shot exists in Arabic and
English (`.ar` / `.en`) at 1440 px (`wide`) and 390 px (`narrow`).

| Shot | Item | What it shows |
| --- | --- | --- |
| `account-menu-role` | Role | The account menu: under the name, the staff member's presets in the interface language, joined with «، » / ", " (here two presets). On a phone the top bar shows only the initial; the role is in the open menu. |
| `single-delete` | Delete preview | One product never used: the server's preview says it will be deleted permanently; red "Delete product". |
| `single-archive` | Delete preview | One product with stock history: it will be archived (hidden from the store, kept in the records), with why; "Archive / أرشفة", not red. |
| `single-failed` | Delete preview | The preview says it can't be processed: the reason, and only Close. The preview response is stubbed for this shot (a real single preview answers 404 for a product that is gone). |
| `bulk-summary` | Bulk delete | The bulk preview for four selected products: 2 will be deleted, 1 archived (its row and reason shown), 1 can't be processed (deleted meanwhile: "The product doesn't exist"). |
| `bulk-result` | Bulk delete | After the single bulk-delete request: deleted / archived / failed counts with names and localized reasons. |

Re-run: `cd admin && ADMIN_LIVE_API=http://localhost:8000/api/v1 npx playwright test --config playwright.visual.config.ts tests/visual/a17.spec.ts`
