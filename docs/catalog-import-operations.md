# Catalog import operations

Catalog import validation is read-only. Files above 500 rows validate in the
background, and every commit runs in the `catalog-imports` worker. The commit
endpoint returns `committing`; clients poll `GET /admin/catalog-imports/{id}`
until the status becomes `completed` or `failed`.

Product and variant rows commit in batches of at most 250. Each applied row has
a durable checkpoint keyed by import id, sheet and workbook row number. A
repeated operation id cannot apply the import twice, and a worker restart
requeues `committing` imports and skips rows whose checkpoint already says
`applied`. Progress, `applied_count`, `commit_batches_done` and
`commit_batches_total` are poll-friendly and only advance after a batch
transaction commits. The optional final Stock posting counts as one batch.

If a row fails, its cell row is marked `failed` with a safe error code and
message. The import stops, while earlier committed batches remain applied and
are reported as such in the detail preview. Retrying the same operation id
starts another worker attempt from those checkpoints; it does not recreate the
already-applied rows.

Stock rows are deliberately different: after every product row succeeds, all
valid Stock rows post together as exactly one immutable phase-5 opening-balance
document. Its operation id derives from the import operation id and import id. The opening
and all Stock row checkpoints commit in the same transaction, so a retry either
sees the one existing document or creates it once. A stock failure leaves the
product batches intact and the import `failed`, with the failing Stock row in
the detail preview. Stock costs remain visible only to callers with
`cost.view`.

The history endpoint returns summary fields only: creator id and display name,
timestamps, status, progress and counts. Full preview rows, including per-row
commit status and error detail, are available only from the detail endpoint.

Multipart upload names are decoded from their UTF-8 bytes before storage, so
Arabic workbook names remain readable in the preview and history. Validation
CSV downloads start with a UTF-8 BOM for Excel. Bulk-image matches return both
Arabic and English product names alongside the product id and SKU.
