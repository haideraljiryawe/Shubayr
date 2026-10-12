-- Mobile audit M1: preserve SKU quantity rules on immutable order/return rows
-- and retain an anonymized customer stub for financial referential integrity.

ALTER TABLE "users"
  ADD COLUMN "anonymized_at" TIMESTAMPTZ(6);

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_identity_check";
ALTER TABLE "users"
  ADD CONSTRAINT "users_identity_check"
  CHECK (
    "phone" IS NOT NULL OR
    "username" IS NOT NULL OR
    "anonymized_at" IS NOT NULL
  );

ALTER TABLE "order_items"
  ADD COLUMN "base_unit" VARCHAR(32),
  ADD COLUMN "whole_units_only" BOOLEAN;

UPDATE "order_items" AS item
SET
  "base_unit" = variant."base_unit",
  "whole_units_only" = variant."whole_units_only"
FROM "product_variants" AS variant
WHERE variant."id" = item."variant_id";

UPDATE "order_items"
SET
  "base_unit" = COALESCE("base_unit", 'piece'),
  "whole_units_only" = COALESCE("whole_units_only", true);

ALTER TABLE "order_items"
  ALTER COLUMN "base_unit" SET NOT NULL,
  ALTER COLUMN "base_unit" SET DEFAULT 'piece',
  ALTER COLUMN "whole_units_only" SET NOT NULL,
  ALTER COLUMN "whole_units_only" SET DEFAULT true;

ALTER TABLE "return_items"
  ADD COLUMN "base_unit" VARCHAR(32),
  ADD COLUMN "whole_units_only" BOOLEAN;

UPDATE "return_items" AS return_item
SET
  "base_unit" = order_item."base_unit",
  "whole_units_only" = order_item."whole_units_only"
FROM "order_items" AS order_item
WHERE order_item."id" = return_item."order_item_id";

UPDATE "return_items"
SET
  "base_unit" = COALESCE("base_unit", 'piece'),
  "whole_units_only" = COALESCE("whole_units_only", true);

ALTER TABLE "return_items"
  ALTER COLUMN "base_unit" SET NOT NULL,
  ALTER COLUMN "base_unit" SET DEFAULT 'piece',
  ALTER COLUMN "whole_units_only" SET NOT NULL,
  ALTER COLUMN "whole_units_only" SET DEFAULT true;
