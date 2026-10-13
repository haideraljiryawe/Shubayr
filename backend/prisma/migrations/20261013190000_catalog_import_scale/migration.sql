ALTER TABLE "product_variants"
ADD COLUMN "barcode" VARCHAR(80);

ALTER TABLE "products"
ADD COLUMN "description_en" TEXT,
ADD COLUMN "description_ar" TEXT;

CREATE UNIQUE INDEX "product_variants_barcode_key"
ON "product_variants"("barcode")
WHERE "barcode" IS NOT NULL;

CREATE INDEX "idx_product_variants_product_sku"
ON "product_variants"("product_id", "sku");

CREATE INDEX "idx_products_admin_list"
ON "products"("status", "created_at" DESC, "id" DESC);

CREATE INDEX "idx_product_images_product"
ON "product_images"("product_id");

CREATE TABLE "catalog_imports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "file_name" VARCHAR(255) NOT NULL,
  "source_object_key" VARCHAR(500) NOT NULL,
  "source_checksum" CHAR(64) NOT NULL,
  "create_missing" BOOLEAN NOT NULL DEFAULT false,
  "status" VARCHAR(24) NOT NULL DEFAULT 'queued',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "row_count" INTEGER NOT NULL DEFAULT 0,
  "create_count" INTEGER NOT NULL DEFAULT 0,
  "update_count" INTEGER NOT NULL DEFAULT 0,
  "error_count" INTEGER NOT NULL DEFAULT 0,
  "warning_count" INTEGER NOT NULL DEFAULT 0,
  "preview" JSONB,
  "error_report_key" VARCHAR(500),
  "operation_id" VARCHAR(128),
  "opening_id" UUID,
  "created_by" UUID NOT NULL,
  "committed_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  CONSTRAINT "catalog_imports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_imports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "catalog_imports_committed_by_fkey" FOREIGN KEY ("committed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "catalog_imports_opening_id_fkey" FOREIGN KEY ("opening_id") REFERENCES "inventory_openings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "catalog_imports_progress_check" CHECK ("progress" BETWEEN 0 AND 100),
  CONSTRAINT "catalog_imports_status_check" CHECK ("status" IN ('queued','validating','ready','committing','completed','failed'))
);

CREATE UNIQUE INDEX "catalog_imports_operation_id_key" ON "catalog_imports"("operation_id");
CREATE UNIQUE INDEX "catalog_imports_opening_id_key" ON "catalog_imports"("opening_id");
CREATE INDEX "idx_catalog_imports_history" ON "catalog_imports"("created_at" DESC, "id" DESC);
CREATE INDEX "idx_catalog_imports_status" ON "catalog_imports"("status", "updated_at");

INSERT INTO "permissions" ("key", "group", "description") VALUES
  ('catalog.import', 'catalog', 'Import products, variants and catalog images')
ON CONFLICT ("key") DO UPDATE SET
  "group" = EXCLUDED."group",
  "description" = EXCLUDED."description";

INSERT INTO "preset_permissions" ("preset_id", "permission_id")
SELECT preset."id", permission."id"
FROM "permission_presets" preset
CROSS JOIN "permissions" permission
WHERE preset."name" IN ('super_admin', 'catalog_editor')
  AND permission."key" = 'catalog.import'
ON CONFLICT ("preset_id", "permission_id") DO NOTHING;
