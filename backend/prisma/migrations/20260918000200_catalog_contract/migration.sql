-- Catalog contract migration.
-- Backfill: existing category icon strings are retained as semantic icon_key
-- values; visibility is retained by renaming is_active. Existing image order is
-- made deterministic by (sort_order, id), then normalized to zero-based order.
-- Rollback: restore the pre-deploy backup. A compensating rollback must drop
-- the image-order index, rename is_visible/icon_key back, and only drop the new
-- columns after confirming no localized descriptions or image URLs are needed.

ALTER TABLE "categories" RENAME COLUMN "icon" TO "icon_key";
ALTER TABLE "categories" RENAME COLUMN "is_active" TO "is_visible";
ALTER TABLE "categories" ALTER COLUMN "icon_key" TYPE VARCHAR(80);
ALTER TABLE "categories"
  ADD COLUMN "description_en" TEXT,
  ADD COLUMN "description_ar" TEXT,
  ADD COLUMN "image_url" TEXT,
  ADD CONSTRAINT "categories_not_self_parent" CHECK ("id" <> "parent_id");

WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "product_id" ORDER BY "sort_order", "id"
  ) - 1 AS normalized_order
  FROM "product_images"
)
UPDATE "product_images" AS image
SET "sort_order" = ranked.normalized_order
FROM ranked
WHERE image."id" = ranked."id";

CREATE UNIQUE INDEX "product_images_product_id_sort_order_key"
  ON "product_images"("product_id", "sort_order");
