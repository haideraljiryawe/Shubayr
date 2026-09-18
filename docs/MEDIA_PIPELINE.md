# Durable media pipeline

Catalog images are uploaded through `POST /api/v1/media/images`. The route
requires `catalog.manage`, accepts JPEG, PNG, WebP, and AVIF up to 8 MiB, and
stores bytes in the configured S3-compatible bucket. PostgreSQL stores the
object key, SHA-256 checksum, MIME type, size, uploader, and a stable URL.

Clients persist the returned `public_url` in category `image_url`, product
image operations, or banner `image_url`. Public reads stream bytes from
`GET /api/v1/media/{id}`; callers never receive MinIO credentials or expiring
presigned URLs. Product operations remain atomic and ordered in the catalog
service: add/remove/replace/move produce contiguous `sort_order` values and the
first image is primary.

`DELETE /api/v1/media/{id}` refuses to remove an associated object. Automatic
thumbnail/format variants and scheduled orphan cleanup are intentionally
fast-follow work; originals are durable and manual deletion is safe now.
