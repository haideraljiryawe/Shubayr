# Owner guide · دليل صاحب المتجر

| | العربية | English |
|---|---|---|
| Quick-start guide · دليل البدء السريع | [ar.md](ar.md) | [en.md](en.md) |
| First-day checklist (printable) · قائمة اليوم الأول | [first-day-checklist.ar.md](first-day-checklist.ar.md) | [first-day-checklist.en.md](first-day-checklist.en.md) |

The pictures in `images/` are taken from the real Web Admin with demo data by
`admin/tests/docs/owner-guide.spec.ts`. To refresh them after a UI change, run it
against a throwaway, seeded API (it creates demo categories, products, zones and
tiers):

```bash
cd admin
ADMIN_DOCS_API=http://localhost:8000/api/v1 npm run docs:screenshots
```

It starts the admin itself with the launch modules (`ADMIN_MODULES=catalog,stock,orders,settings,users`)
and writes `images/<step>.<ar|en>.png`.

Section 6 (Excel import and bulk images) is a placeholder until the import screens (A3) are released.
