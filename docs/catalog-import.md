# Catalog import and large-catalog operations

Contract version 15.1 adds owner/staff catalog tooling for the eight-day Web
Admin launch. It does not add a customer or delivery-agent workflow.

## Excel workflow

1. A staff member with `catalog.import` downloads the current template from
   `GET /admin/catalog-imports/template`. Do not rename its sheets or headers.
2. They upload the `.xlsx` to the preview route. Preview records import
   history and stores the source file, but it does not write products,
   variants, categories, brands, stock, journals, or costs. Each workbook row
   reports `create`, `update`, `warning`, or `error` and every issue includes an
   Excel cell reference. More than 500 rows validates in the background; the
   hard limit is 5,000 data rows across both sheets.
3. Missing two-level categories and brands are errors unless `create_missing`
   was explicitly selected. Newly created taxonomy values are hidden. SKU is
   the update key and barcodes remain globally unique.
4. Commit applies all valid preview rows in one database transaction. Its
   operation id is idempotent: replaying the same commit returns the first
   result and cannot create another product or opening balance.
5. Valid Stock rows are optional. Committing them requires both
   `inventory.manage` and `cost.view`; all rows become exactly one posted
   phase-5 inventory-opening document on the current Asia/Baghdad business
   date. Catalog rows, stock, journal entries, import state, and audit data
   commit or roll back together. Unit cost never appears without `cost.view`.

Linked prices require an enabled currency and an applicable exchange rate.
Conversion never falls back to 1. The configured `sale_rounding_multiple` is
applied in the same direction as the regular linked-pricing service.

## Images

The image ZIP route accepts `SKU.jpg`, `SKU-2.jpg`, and later numbered images.
Files are matched case-insensitively to SKU, ordered naturally, rotated,
bounded to 1600×1600 without enlargement, compressed to WebP, and stored in
the managed media bucket. The result lists every unmatched filename. The
operation id prevents duplicate attachment on retry.

The spreadsheet's image URL columns are fetched only during commit, then pass
through the same resize/compression/storage pipeline. They are never left as
third-party hotlinks.

## Product-list scale

`GET /admin/products` performs search, filtering, stable sorting, counting and
pagination in PostgreSQL. Search covers Arabic/English names, descriptions,
SKU codes and barcodes. Status, stock state, and image-presence filters are
server-side. Only the requested page is hydrated; the Web Admin no longer
downloads up to 2,000 products for browser filtering.

`POST /admin/products/bulk` changes up to 500 product ids in one transaction
and audit trail. It supports publish, hide, category, and brand changes and
returns one result per requested id. Its operation id is replay-safe.

## Retention and audit

Import history retains the source checksum, status, counts, validation preview,
error-report object key, actor ids, operation id, optional opening id, and
timestamps. Source object keys and checksums are not returned to clients.
Product/import and bulk-image commits write audit events. Financial and stock
documents remain immutable under the existing ledger rules.
