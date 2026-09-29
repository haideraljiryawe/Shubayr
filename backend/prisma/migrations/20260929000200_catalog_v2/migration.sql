-- Catalog v2: two-level categories, independent brands, SKU pricing and
-- three-decimal quantities. Existing product-level/base stock is assigned a
-- real generated SKU so historical rows keep their identity.

CREATE TABLE "brands" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name_en" VARCHAR(120) NOT NULL,
  "name_ar" VARCHAR(120) NOT NULL,
  "slug" VARCHAR(140) NOT NULL,
  "logo_url" TEXT,
  "is_visible" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "brands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "brands_slug_key" UNIQUE ("slug")
);
CREATE INDEX "idx_brands_public" ON "brands"("is_visible", "sort_order", "id");

ALTER TABLE "products"
  ADD COLUMN "brand_id" UUID,
  ADD COLUMN "published_at" TIMESTAMPTZ(6),
  ADD COLUMN "price_approved_at" TIMESTAMPTZ(6);
UPDATE "products"
SET "published_at" = CASE WHEN "status" = 'active' THEN CURRENT_TIMESTAMP ELSE NULL END,
    "price_approved_at" = CURRENT_TIMESTAMP;
ALTER TABLE "products"
  DROP CONSTRAINT IF EXISTS "products_negotiation_values_check",
  DROP COLUMN "is_negotiable",
  DROP COLUMN "floor_price",
  DROP COLUMN "points_price";
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey"
  FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
CREATE INDEX "idx_products_brand" ON "products"("brand_id");

ALTER TABLE "product_variants"
  ADD COLUMN "base_unit" VARCHAR(32) NOT NULL DEFAULT 'piece',
  ADD COLUMN "whole_units_only" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "selling_price" DECIMAL(20,6),
  ADD COLUMN "low_stock_threshold" DECIMAL(20,3),
  ADD COLUMN "pricing_mode" VARCHAR(16) NOT NULL DEFAULT 'fixed',
  ADD COLUMN "reference_currency_code" CHAR(3),
  ADD COLUMN "reference_price" DECIMAL(20,6),
  ADD COLUMN "published_price" DECIMAL(20,6),
  ADD COLUMN "price_approved_at" TIMESTAMPTZ(6),
  ADD COLUMN "price_version_id" UUID,
  ADD COLUMN "awaiting_rate_id" UUID,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "product_variants" v
SET "selling_price" = CASE
      WHEN v."price_delta" = 0 THEN NULL
      ELSE p."price" + v."price_delta"
    END,
    "price_approved_at" = CURRENT_TIMESTAMP
FROM "products" p
WHERE p."id" = v."product_id";

CREATE TEMP TABLE "catalog_v2_base_variants" (
  "product_id" UUID PRIMARY KEY,
  "variant_id" UUID NOT NULL
) ON COMMIT DROP;
INSERT INTO "catalog_v2_base_variants" ("product_id", "variant_id")
SELECT "id", gen_random_uuid() FROM "products";
INSERT INTO "product_variants" (
  "id", "product_id", "sku", "attributes", "price_delta", "currency_code",
  "base_unit", "whole_units_only", "pricing_mode", "price_approved_at", "updated_at"
)
SELECT m."variant_id", p."id", 'BASE-' || upper(substr(replace(m."variant_id"::text, '-', ''), 1, 24)),
       jsonb_build_object('legacy_base', true), 0, p."currency_code", 'piece', true,
       'fixed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "products" p
JOIN "catalog_v2_base_variants" m ON m."product_id" = p."id";

UPDATE "purchase_invoice_items" x SET "variant_id" = m."variant_id"
FROM "catalog_v2_base_variants" m WHERE x."variant_id" IS NULL AND x."product_id" = m."product_id";
UPDATE "inventory_batches" x SET "variant_id" = m."variant_id"
FROM "catalog_v2_base_variants" m WHERE x."variant_id" IS NULL AND x."product_id" = m."product_id";
UPDATE "cart_items" x SET "variant_id" = m."variant_id"
FROM "catalog_v2_base_variants" m WHERE x."variant_id" IS NULL AND x."product_id" = m."product_id";
UPDATE "order_items" x SET "variant_id" = m."variant_id"
FROM "catalog_v2_base_variants" m WHERE x."variant_id" IS NULL AND x."product_id" = m."product_id";
UPDATE "simple_stock_holds" x SET "variant_id" = m."variant_id"
FROM "catalog_v2_base_variants" m WHERE x."variant_id" IS NULL AND x."product_id" = m."product_id";

ALTER TABLE "purchase_invoice_items" ALTER COLUMN "variant_id" SET NOT NULL;
ALTER TABLE "inventory_batches" ALTER COLUMN "variant_id" SET NOT NULL;
ALTER TABLE "cart_items" ALTER COLUMN "variant_id" SET NOT NULL;
ALTER TABLE "order_items" ALTER COLUMN "variant_id" SET NOT NULL;
ALTER TABLE "simple_stock_holds" ALTER COLUMN "variant_id" SET NOT NULL;

ALTER TABLE "purchase_invoice_items" ALTER COLUMN "quantity" TYPE DECIMAL(20,3) USING "quantity"::DECIMAL(20,3);
ALTER TABLE "inventory_batches" ALTER COLUMN "qty_received" TYPE DECIMAL(20,3) USING "qty_received"::DECIMAL(20,3);
ALTER TABLE "batch_stock" ALTER COLUMN "quantity" TYPE DECIMAL(20,3) USING "quantity"::DECIMAL(20,3);
ALTER TABLE "stock_movements" ALTER COLUMN "quantity" TYPE DECIMAL(20,3) USING "quantity"::DECIMAL(20,3);
ALTER TABLE "cart_items" ALTER COLUMN "quantity" TYPE DECIMAL(20,3) USING "quantity"::DECIMAL(20,3);
ALTER TABLE "order_items" ALTER COLUMN "quantity" TYPE DECIMAL(20,3) USING "quantity"::DECIMAL(20,3);
ALTER TABLE "simple_stock_holds" ALTER COLUMN "quantity" TYPE DECIMAL(20,3) USING "quantity"::DECIMAL(20,3);
ALTER TABLE "stock_reservations" ALTER COLUMN "quantity" TYPE DECIMAL(20,3) USING "quantity"::DECIMAL(20,3);
ALTER TABLE "pick_list_items" ALTER COLUMN "quantity" TYPE DECIMAL(20,3) USING "quantity"::DECIMAL(20,3);
ALTER TABLE "return_items" ALTER COLUMN "quantity" TYPE DECIMAL(20,3) USING "quantity"::DECIMAL(20,3);
ALTER TABLE "return_items" ALTER COLUMN "approved_quantity" TYPE DECIMAL(20,3) USING "approved_quantity"::DECIMAL(20,3);

CREATE TABLE "price_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "version" SERIAL NOT NULL,
  "exchange_rate_id" UUID NOT NULL,
  "currency_code" CHAR(3) NOT NULL,
  "rate" DECIMAL(24,10) NOT NULL,
  "rounding_multiple" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "published_by" UUID NOT NULL,
  "variant_count" INTEGER NOT NULL,
  "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "price_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "price_versions_version_key" UNIQUE ("version"),
  CONSTRAINT "price_versions_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id")
    REFERENCES "exchange_rates"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "idx_price_versions_currency" ON "price_versions"("currency_code", "published_at" DESC);

CREATE TABLE "linked_price_previews" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_id" UUID NOT NULL,
  "currency_code" CHAR(3) NOT NULL,
  "proposed_rate" DECIMAL(24,10) NOT NULL,
  "effective_at" TIMESTAMPTZ(6) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "linked_price_previews_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_linked_price_previews_actor" ON "linked_price_previews"("actor_id", "expires_at");

ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_reference_currency_code_fkey"
  FOREIGN KEY ("reference_currency_code") REFERENCES "currencies"("code") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_price_version_id_fkey"
  FOREIGN KEY ("price_version_id") REFERENCES "price_versions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_awaiting_rate_id_fkey"
  FOREIGN KEY ("awaiting_rate_id") REFERENCES "exchange_rates"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_catalog_v2_check" CHECK (
  "base_unit" <> '' AND
  ("low_stock_threshold" IS NULL OR "low_stock_threshold" >= 0) AND
  ("selling_price" IS NULL OR "selling_price" >= 0) AND
  "pricing_mode" IN ('fixed', 'linked') AND
  (
    ("pricing_mode" = 'fixed' AND "reference_currency_code" IS NULL AND "reference_price" IS NULL) OR
    ("pricing_mode" = 'linked' AND "reference_currency_code" IS NOT NULL AND "reference_price" > 0)
  )
);
CREATE INDEX "idx_product_variants_linked" ON "product_variants"("pricing_mode", "reference_currency_code");

-- A category can be a root department or its direct child, never a third
-- level. The trigger also prevents moving a category with children below a
-- different root under concurrent writes.
CREATE FUNCTION "enforce_two_level_category"() RETURNS trigger AS $$
BEGIN
  IF NEW."parent_id" IS NOT NULL THEN
    IF NEW."parent_id" = NEW."id" THEN
      RAISE EXCEPTION 'CATEGORY_MAX_DEPTH: a category cannot parent itself' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM "categories" p WHERE p."id" = NEW."parent_id" AND p."parent_id" IS NOT NULL) THEN
      RAISE EXCEPTION 'CATEGORY_MAX_DEPTH: subcategories cannot have children' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM "categories" c WHERE c."parent_id" = NEW."id") THEN
      RAISE EXCEPTION 'CATEGORY_MAX_DEPTH: a category with children cannot become a child' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "categories_two_level_trigger"
BEFORE INSERT OR UPDATE OF "parent_id" ON "categories"
FOR EACH ROW EXECUTE FUNCTION "enforce_two_level_category"();

-- Fractional writes are rejected at the database boundary for piece SKUs,
-- including writes that bypass the API.
CREATE FUNCTION "enforce_sku_quantity"() RETURNS trigger AS $$
DECLARE
  sku_id UUID;
  whole_only BOOLEAN;
  amount NUMERIC;
BEGIN
  IF TG_TABLE_NAME IN ('purchase_invoice_items', 'inventory_batches', 'cart_items', 'order_items', 'simple_stock_holds') THEN
    sku_id := (to_jsonb(NEW)->>'variant_id')::UUID;
  ELSIF TG_TABLE_NAME IN ('batch_stock', 'stock_movements', 'stock_reservations', 'pick_list_items') THEN
    SELECT "variant_id" INTO sku_id FROM "inventory_batches" WHERE "id" = (to_jsonb(NEW)->>'batch_id')::UUID;
  ELSIF TG_TABLE_NAME = 'return_items' THEN
    SELECT "variant_id" INTO sku_id FROM "order_items" WHERE "id" = (to_jsonb(NEW)->>'order_item_id')::UUID;
  END IF;
  SELECT "whole_units_only" INTO whole_only FROM "product_variants" WHERE "id" = sku_id;
  IF TG_TABLE_NAME = 'inventory_batches' THEN
    amount := (to_jsonb(NEW)->>'qty_received')::NUMERIC;
  ELSE
    amount := (to_jsonb(NEW)->>'quantity')::NUMERIC;
  END IF;
  IF whole_only AND amount <> trunc(amount) THEN
    RAISE EXCEPTION 'SKU_WHOLE_UNITS_ONLY: fractional quantity is not allowed for this SKU' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'return_items' AND whole_only
     AND (to_jsonb(NEW)->>'approved_quantity')::NUMERIC <> trunc((to_jsonb(NEW)->>'approved_quantity')::NUMERIC) THEN
    RAISE EXCEPTION 'SKU_WHOLE_UNITS_ONLY: fractional approved quantity is not allowed for this SKU' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "purchase_invoice_items_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "purchase_invoice_items" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "inventory_batches_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "qty_received" ON "inventory_batches" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "batch_stock_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "batch_stock" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "stock_movements_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "stock_movements" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "cart_items_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "cart_items" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "order_items_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "order_items" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "simple_stock_holds_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "simple_stock_holds" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "stock_reservations_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "stock_reservations" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "pick_list_items_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "pick_list_items" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "return_items_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity", "approved_quantity" ON "return_items" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();

-- Some pre-release databases experimented with a negotiations table. If one
-- exists, close only its open rows; completed sales are untouched. Any held
-- reservation owned by such a negotiation is released when that optional
-- legacy column is present.
DO $$
BEGIN
  IF to_regclass('public.negotiations') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='negotiations' AND column_name='status') THEN
    EXECUTE 'UPDATE negotiations SET status = ''closed_removed'' WHERE status NOT IN (''closed_removed'', ''completed'')';
  END IF;
  IF to_regclass('public.stock_reservations') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_reservations' AND column_name='negotiation_id') THEN
    EXECUTE 'UPDATE stock_reservations SET status = ''released'' WHERE negotiation_id IS NOT NULL AND status = ''reserved''';
  END IF;
END;
$$;

INSERT INTO "store_settings" ("key", "value") VALUES
  ('sale_rounding_multiple', '0')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "permissions" ("key", "group", "description") VALUES
  ('catalog.brands', 'catalog', 'Manage brands'),
  ('prices.publish_linked', 'catalog', 'Publish linked SKU prices')
ON CONFLICT ("key") DO UPDATE SET
  "group" = EXCLUDED."group", "description" = EXCLUDED."description";

INSERT INTO "preset_permissions" ("preset_id", "permission_id")
SELECT pp."id", p."id"
FROM "permission_presets" pp
CROSS JOIN "permissions" p
WHERE pp."name" = 'super_admin' AND p."key" IN ('catalog.brands', 'prices.publish_linked')
ON CONFLICT DO NOTHING;
