ALTER TABLE "catalog_imports"
  ADD COLUMN "commit_batches_done" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "commit_batches_total" INTEGER NOT NULL DEFAULT 0;

WITH batch_counts AS (
  SELECT
    ci."id",
    COUNT(*) FILTER (
      WHERE jsonb_typeof(row_data.value->'product') = 'object'
    )::INTEGER AS product_rows,
    COUNT(*) FILTER (
      WHERE jsonb_typeof(row_data.value->'stock') = 'object'
    )::INTEGER AS stock_rows
  FROM "catalog_imports" ci
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(ci."preview"->'rows', '[]'::jsonb)
  ) AS row_data(value)
  WHERE row_data.value->>'apply_action' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        COALESCE(row_data.value->'issues', '[]'::jsonb)
      ) AS issue(value)
      WHERE issue.value->>'severity' = 'error'
    )
  GROUP BY ci."id"
), progress AS (
  SELECT
    ci."id",
    counts.product_rows,
    counts.stock_rows,
    CEIL(counts.product_rows / 250.0)::INTEGER
      + CASE WHEN counts.stock_rows > 0 THEN 1 ELSE 0 END AS batches_total,
    LEAST(ci."applied_count", counts.product_rows) AS applied_products
  FROM "catalog_imports" ci
  JOIN batch_counts counts ON counts."id" = ci."id"
)
UPDATE "catalog_imports" ci
SET
  "commit_batches_total" = progress.batches_total,
  "commit_batches_done" = CASE
    WHEN ci."status" = 'completed' THEN progress.batches_total
    WHEN progress.applied_products = progress.product_rows
      THEN CEIL(progress.product_rows / 250.0)::INTEGER
    ELSE FLOOR(progress.applied_products / 250.0)::INTEGER
  END
FROM progress
WHERE progress."id" = ci."id";

ALTER TABLE "catalog_imports"
  ADD CONSTRAINT "catalog_imports_commit_batches_check"
  CHECK (
    "commit_batches_done" >= 0
    AND "commit_batches_total" >= 0
    AND "commit_batches_done" <= "commit_batches_total"
  );
