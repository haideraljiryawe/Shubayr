ALTER TABLE "catalog_imports"
  ADD COLUMN "applied_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "commit_attempt" INTEGER NOT NULL DEFAULT 0;

UPDATE "catalog_imports"
SET "applied_count" = GREATEST("row_count" - "error_count", 0)
WHERE "status" = 'completed';

CREATE TABLE "catalog_import_row_results" (
  "import_id" UUID NOT NULL,
  "sheet" VARCHAR(32) NOT NULL,
  "row_number" INTEGER NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "action" VARCHAR(16),
  "result" JSONB,
  "error_code" VARCHAR(80),
  "error_message" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_import_row_results_pkey"
    PRIMARY KEY ("import_id", "sheet", "row_number"),
  CONSTRAINT "catalog_import_row_results_import_id_fkey"
    FOREIGN KEY ("import_id") REFERENCES "catalog_imports"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "catalog_import_row_results_sheet_check"
    CHECK ("sheet" IN ('Products+Variants', 'Stock')),
  CONSTRAINT "catalog_import_row_results_status_check"
    CHECK ("status" IN ('applied', 'failed')),
  CONSTRAINT "catalog_import_row_results_row_number_check"
    CHECK ("row_number" >= 2)
);

CREATE INDEX "idx_catalog_import_row_results_status"
ON "catalog_import_row_results"("import_id", "status", "row_number");
