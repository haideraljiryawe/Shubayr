# Catalog contract rules

## Category hierarchy and visibility

- A category tree has at most five levels: roots are depth 0 and the deepest
  allowed node is depth 4.
- `parent_id: null` means root. A node cannot parent itself or be reparented
  under any descendant. Reparenting is rejected if the moved subtree would
  exceed depth 4.
- Public reads return only `is_visible=true` nodes whose full ancestor chain is
  visible. Staff using `GET /admin/categories` can read hidden nodes.
- Without `parent_id`, list routes return roots. With `parent_id`, they return
  direct children; `include_subtree=true` returns every descendant. Siblings
  are ordered by `sort_order`, then `id` for a stable tie-break.
- Deletion is restricted to leaf categories with no products. A populated or
  parent category returns 409 `CONFLICT`; set `is_visible=false` to hide it.
- `icon_key` is a semantic application key (for example
  `consumer_electronics`), never a Flutter/Material codepoint or IconData value.
  `image_url` is independent from the icon.

Cycle/depth/delete rules require transactional service checks in the catalog
vertical slice; the database also rejects immediate self-parenting.

## Product media

Images are ordered by zero-based `sort_order`, unique within a product. The
first image is the primary image; primary is derived, not stored. Create accepts
an ordered image list. PATCH accepts an atomic sequence of `add`, `remove`,
`replace`, and `move` operations. Each operation is applied in request order,
the final list is compacted to consecutive positions, and final position 0 is
primary. The durable media slice owns upload, storage, and stable URL issuance.

## Search implementation

The first real-data slice uses case-insensitive PostgreSQL matching across the
English name, Arabic name, and description. Meilisearch indexing, typo
tolerance, and ranking are a follow-up once catalog write events are available.
