-- Phase 5: lot-level inventory, allocation, custody and moving-average costing.

ALTER TABLE "products"
  ADD COLUMN "search_sync_required" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "search_synced_at" TIMESTAMPTZ(6);
CREATE INDEX "idx_products_search_sync" ON "products"("search_sync_required", "updated_at");

ALTER TABLE "orders"
  ADD COLUMN "inventory_attention_required" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "warehouses"
  ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "warehouse_locations"
  ADD COLUMN "code" VARCHAR(40),
  ADD COLUMN "description" TEXT,
  ADD COLUMN "is_sellable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "warehouse_locations"
SET "code" = CASE
  WHEN concat_ws('-', "zone", "aisle", "shelf", "bin") <> ''
    THEN concat_ws('-', "zone", "aisle", "shelf", "bin")
  ELSE 'LOC-' || upper(substr(replace("id"::text, '-', ''), 1, 8))
END;
ALTER TABLE "warehouse_locations" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "warehouse_locations_warehouse_id_code_key"
  ON "warehouse_locations"("warehouse_id", "code");

ALTER TABLE "inventory_batches"
  ALTER COLUMN "purchase_cost" TYPE DECIMAL(30,12) USING "purchase_cost"::DECIMAL(30,12),
  ADD COLUMN "landed_cost_share" DECIMAL(30,12) NOT NULL DEFAULT 0,
  ADD COLUMN "source_type" VARCHAR(40) NOT NULL DEFAULT 'legacy_opening',
  ADD COLUMN "source_id" UUID;

ALTER TABLE "batch_stock"
  ADD COLUMN "reserved" DECIMAL(20,3) NOT NULL DEFAULT 0,
  ADD CONSTRAINT "batch_stock_balance_check"
    CHECK ("quantity" >= 0 AND "reserved" >= 0 AND "reserved" <= "quantity");

ALTER TABLE "stock_reservations"
  ADD COLUMN "released_at" TIMESTAMPTZ(6),
  ADD COLUMN "consumed_at" TIMESTAMPTZ(6),
  ADD COLUMN "issue_cost_iqd" DECIMAL(30,12);
CREATE INDEX "idx_reservations_balance_status"
  ON "stock_reservations"("batch_id", "location_id", "status");

UPDATE "batch_stock" b
SET "reserved" = r."quantity"
FROM (
  SELECT "batch_id", "location_id", SUM("quantity")::DECIMAL(20,3) AS "quantity"
  FROM "stock_reservations"
  WHERE "status" = 'reserved'
  GROUP BY "batch_id", "location_id"
) r
WHERE b."batch_id" = r."batch_id" AND b."location_id" = r."location_id"
  AND r."quantity" <= b."quantity";

ALTER TABLE "stock_movements"
  ADD COLUMN "unit_cost_iqd" DECIMAL(30,12) NOT NULL DEFAULT 0,
  ADD COLUMN "source_type" VARCHAR(40) NOT NULL DEFAULT 'legacy',
  ADD COLUMN "source_id" UUID,
  ADD COLUMN "custody_party_id" UUID;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_custody_party_id_fkey"
  FOREIGN KEY ("custody_party_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE INDEX "idx_movements_source" ON "stock_movements"("source_type", "source_id");
CREATE INDEX "idx_movements_posted" ON "stock_movements"("created_at", "id");
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_phase5_check" CHECK (
  "quantity" > 0 AND "unit_cost_iqd" >= 0 AND
  "type" IN ('receive','reserve','release','issue_to_custody','custody_to_sold','return_in','transfer','adjust','write_down')
);

CREATE TABLE "sku_costs" (
  "variant_id" UUID NOT NULL,
  "book_quantity" DECIMAL(20,3) NOT NULL DEFAULT 0,
  "book_value_iqd" DECIMAL(30,12) NOT NULL DEFAULT 0,
  "average_cost_iqd" DECIMAL(30,12) NOT NULL DEFAULT 0,
  "last_landed_cost_iqd" DECIMAL(30,12),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sku_costs_pkey" PRIMARY KEY ("variant_id"),
  CONSTRAINT "sku_costs_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "sku_costs_values_check" CHECK ("book_quantity" >= 0 AND "book_value_iqd" >= 0 AND "average_cost_iqd" >= 0)
);

CREATE TABLE "custody_holdings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "order_item_id" UUID NOT NULL,
  "delivery_id" UUID NOT NULL,
  "custody_party_id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "quantity" DECIMAL(20,3) NOT NULL,
  "unit_cost_iqd" DECIMAL(30,12) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'in_custody',
  "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settled_at" TIMESTAMPTZ(6),
  CONSTRAINT "custody_holdings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "custody_holdings_order_item_batch_party_key" UNIQUE ("order_item_id", "batch_id", "custody_party_id"),
  CONSTRAINT "custody_holdings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "custody_holdings_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "custody_holdings_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "custody_holdings_custody_party_id_fkey" FOREIGN KEY ("custody_party_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "custody_holdings_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "custody_holdings_values_check" CHECK ("quantity" > 0 AND "unit_cost_iqd" >= 0 AND "status" IN ('in_custody','sold','returned'))
);
CREATE INDEX "idx_custody_holdings_party_status" ON "custody_holdings"("custody_party_id", "status");
CREATE INDEX "idx_custody_holdings_order_status" ON "custody_holdings"("order_id", "status");

CREATE TABLE "inventory_openings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_number" VARCHAR(40) NOT NULL,
  "operation_id" VARCHAR(128) NOT NULL,
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'posted',
  "created_by" UUID NOT NULL,
  "journal_entry_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_openings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_openings_document_number_key" UNIQUE ("document_number"),
  CONSTRAINT "inventory_openings_operation_id_key" UNIQUE ("operation_id"),
  CONSTRAINT "inventory_openings_journal_entry_id_key" UNIQUE ("journal_entry_id"),
  CONSTRAINT "inventory_openings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "inventory_openings_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "idx_inventory_openings_date" ON "inventory_openings"("document_date", "id");

CREATE TABLE "inventory_opening_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "opening_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "quantity" DECIMAL(20,3) NOT NULL,
  "unit_cost_iqd" DECIMAL(30,12) NOT NULL,
  "landed_cost_share" DECIMAL(30,12) NOT NULL DEFAULT 0,
  "expiry_date" DATE,
  CONSTRAINT "inventory_opening_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_opening_lines_lot_id_key" UNIQUE ("lot_id"),
  CONSTRAINT "inventory_opening_lines_opening_id_fkey" FOREIGN KEY ("opening_id") REFERENCES "inventory_openings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "inventory_opening_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "inventory_opening_lines_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "warehouse_locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "inventory_opening_lines_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_batches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "inventory_opening_lines_values_check" CHECK ("quantity" > 0 AND "unit_cost_iqd" >= 0 AND "landed_cost_share" >= 0)
);
CREATE INDEX "idx_inventory_opening_lines_opening" ON "inventory_opening_lines"("opening_id");

CREATE TABLE "stock_transfers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_number" VARCHAR(40) NOT NULL,
  "operation_id" VARCHAR(128) NOT NULL,
  "document_date" DATE NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'posted',
  "reason" VARCHAR(500) NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_transfers_document_number_key" UNIQUE ("document_number"),
  CONSTRAINT "stock_transfers_operation_id_key" UNIQUE ("operation_id"),
  CONSTRAINT "stock_transfers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "idx_stock_transfers_date" ON "stock_transfers"("document_date", "id");

CREATE TABLE "stock_transfer_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "transfer_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "from_location_id" UUID NOT NULL,
  "to_location_id" UUID NOT NULL,
  "quantity" DECIMAL(20,3) NOT NULL,
  CONSTRAINT "stock_transfer_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "stock_transfer_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "stock_transfer_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "stock_transfer_lines_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "warehouse_locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "stock_transfer_lines_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "warehouse_locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "stock_transfer_lines_values_check" CHECK ("quantity" > 0 AND "from_location_id" <> "to_location_id")
);
CREATE INDEX "idx_stock_transfer_lines_transfer" ON "stock_transfer_lines"("transfer_id");

CREATE TABLE "stock_counts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_number" VARCHAR(40) NOT NULL,
  "operation_id" VARCHAR(128),
  "warehouse_id" UUID,
  "location_id" UUID,
  "variant_id" UUID,
  "snapshot_at" TIMESTAMPTZ(6) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "reason" VARCHAR(500) NOT NULL,
  "created_by" UUID NOT NULL,
  "approved_by" UUID,
  "journal_entry_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_at" TIMESTAMPTZ(6),
  CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_counts_document_number_key" UNIQUE ("document_number"),
  CONSTRAINT "stock_counts_operation_id_key" UNIQUE ("operation_id"),
  CONSTRAINT "stock_counts_journal_entry_id_key" UNIQUE ("journal_entry_id"),
  CONSTRAINT "stock_counts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "stock_counts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "warehouse_locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "stock_counts_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "stock_counts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "stock_counts_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "stock_counts_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "stock_counts_scope_check" CHECK ("warehouse_id" IS NOT NULL OR "location_id" IS NOT NULL OR "variant_id" IS NOT NULL),
  CONSTRAINT "stock_counts_status_check" CHECK ("status" IN ('draft','approved'))
);
CREATE INDEX "idx_stock_counts_snapshot" ON "stock_counts"("snapshot_at", "id");

CREATE TABLE "stock_count_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "count_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "system_quantity" DECIMAL(20,3) NOT NULL,
  "counted_quantity" DECIMAL(20,3) NOT NULL,
  "difference" DECIMAL(20,3) NOT NULL,
  CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_count_lines_count_batch_location_key" UNIQUE ("count_id", "batch_id", "location_id"),
  CONSTRAINT "stock_count_lines_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "stock_counts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "stock_count_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "stock_count_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "stock_count_lines_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "warehouse_locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "stock_count_lines_values_check" CHECK ("system_quantity" >= 0 AND "counted_quantity" >= 0 AND "difference" = "counted_quantity" - "system_quantity")
);

CREATE TABLE "inventory_write_downs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_number" VARCHAR(40) NOT NULL,
  "operation_id" VARCHAR(128) NOT NULL,
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'posted',
  "created_by" UUID NOT NULL,
  "journal_entry_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_write_downs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_write_downs_document_number_key" UNIQUE ("document_number"),
  CONSTRAINT "inventory_write_downs_operation_id_key" UNIQUE ("operation_id"),
  CONSTRAINT "inventory_write_downs_journal_entry_id_key" UNIQUE ("journal_entry_id"),
  CONSTRAINT "inventory_write_downs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "inventory_write_downs_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "idx_inventory_write_downs_date" ON "inventory_write_downs"("document_date", "id");

CREATE TABLE "inventory_write_down_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "write_down_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "quantity" DECIMAL(20,3) NOT NULL,
  "unit_cost_iqd" DECIMAL(30,12) NOT NULL,
  CONSTRAINT "inventory_write_down_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_write_down_lines_write_down_id_fkey" FOREIGN KEY ("write_down_id") REFERENCES "inventory_write_downs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "inventory_write_down_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "inventory_write_down_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "inventory_write_down_lines_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "warehouse_locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "inventory_write_down_lines_values_check" CHECK ("quantity" > 0 AND "unit_cost_iqd" >= 0)
);
CREATE INDEX "idx_inventory_write_down_lines_document" ON "inventory_write_down_lines"("write_down_id");

-- Establish a reconciled moving-average baseline for pre-phase-5 stock.
INSERT INTO "sku_costs" ("variant_id", "book_quantity", "book_value_iqd", "average_cost_iqd", "last_landed_cost_iqd")
SELECT b."variant_id",
       SUM(s."quantity")::DECIMAL(20,3),
       SUM(s."quantity" * b."purchase_cost")::DECIMAL(30,12),
       CASE WHEN SUM(s."quantity") = 0 THEN 0
            ELSE (SUM(s."quantity" * b."purchase_cost") / SUM(s."quantity"))::DECIMAL(30,12) END,
       MAX(b."purchase_cost")::DECIMAL(30,12)
FROM "inventory_batches" b
JOIN "batch_stock" s ON s."batch_id" = b."id"
GROUP BY b."variant_id"
ON CONFLICT ("variant_id") DO NOTHING;

-- Reservation/release movements record availability changes while leaving
-- on-hand quantity and value unchanged.
INSERT INTO "stock_movements" ("batch_id","type","from_location","to_location","quantity","reference","source_type","source_id","unit_cost_iqd","created_at")
SELECT r."batch_id", 'reserve', r."location_id", r."location_id", r."quantity",
       'Phase 5 reservation baseline', 'order', r."order_id", 0, r."created_at"
FROM "stock_reservations" r WHERE r."status" = 'reserved';

DROP TABLE "simple_stock_holds";

CREATE OR REPLACE FUNCTION "enforce_sku_quantity"() RETURNS trigger AS $$
DECLARE
  sku_id UUID;
  whole_only BOOLEAN;
  payload JSONB := to_jsonb(NEW);
BEGIN
  IF TG_TABLE_NAME IN ('purchase_invoice_items','inventory_batches','cart_items','order_items',
                       'inventory_opening_lines','stock_transfer_lines','stock_count_lines',
                     'inventory_write_down_lines') THEN
    sku_id := (payload->>'variant_id')::UUID;
  ELSIF TG_TABLE_NAME IN ('batch_stock','stock_movements','stock_reservations','pick_list_items','custody_holdings') THEN
    SELECT "variant_id" INTO sku_id FROM "inventory_batches" WHERE "id" = (payload->>'batch_id')::UUID;
  ELSIF TG_TABLE_NAME = 'return_items' THEN
    SELECT "variant_id" INTO sku_id FROM "order_items" WHERE "id" = (payload->>'order_item_id')::UUID;
  END IF;
  SELECT "whole_units_only" INTO whole_only FROM "product_variants" WHERE "id" = sku_id;
  IF NOT whole_only THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'inventory_batches' AND (payload->>'qty_received')::NUMERIC <> trunc((payload->>'qty_received')::NUMERIC) THEN
    RAISE EXCEPTION 'SKU_WHOLE_UNITS_ONLY: fractional quantity is not allowed for this SKU' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'stock_count_lines' AND (
    (payload->>'system_quantity')::NUMERIC <> trunc((payload->>'system_quantity')::NUMERIC) OR
    (payload->>'counted_quantity')::NUMERIC <> trunc((payload->>'counted_quantity')::NUMERIC) OR
    (payload->>'difference')::NUMERIC <> trunc((payload->>'difference')::NUMERIC)
  ) THEN
    RAISE EXCEPTION 'SKU_WHOLE_UNITS_ONLY: fractional count quantity is not allowed for this SKU' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME <> 'inventory_batches' AND TG_TABLE_NAME <> 'stock_count_lines'
    AND (payload->>'quantity')::NUMERIC <> trunc((payload->>'quantity')::NUMERIC) THEN
    RAISE EXCEPTION 'SKU_WHOLE_UNITS_ONLY: fractional quantity is not allowed for this SKU' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'return_items' AND (payload->>'approved_quantity')::NUMERIC <> trunc((payload->>'approved_quantity')::NUMERIC) THEN
    RAISE EXCEPTION 'SKU_WHOLE_UNITS_ONLY: fractional approved quantity is not allowed for this SKU' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "inventory_opening_lines_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "inventory_opening_lines" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "stock_transfer_lines_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "stock_transfer_lines" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "stock_count_lines_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "system_quantity", "counted_quantity", "difference" ON "stock_count_lines" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "inventory_write_down_lines_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "inventory_write_down_lines" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "custody_holdings_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "custody_holdings" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();

CREATE FUNCTION "reject_stock_movement_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'STOCK_MOVEMENT_IMMUTABLE: stock movements cannot be updated or deleted' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "stock_movements_immutable_trigger" BEFORE UPDATE OR DELETE ON "stock_movements" FOR EACH ROW EXECUTE FUNCTION "reject_stock_movement_mutation"();

CREATE FUNCTION "reject_posted_inventory_document_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'INVENTORY_DOCUMENT_IMMUTABLE: posted inventory documents cannot be updated or deleted' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "inventory_openings_immutable_trigger" BEFORE UPDATE OR DELETE ON "inventory_openings" FOR EACH ROW EXECUTE FUNCTION "reject_posted_inventory_document_mutation"();
CREATE TRIGGER "inventory_opening_lines_immutable_trigger" BEFORE UPDATE OR DELETE ON "inventory_opening_lines" FOR EACH ROW EXECUTE FUNCTION "reject_posted_inventory_document_mutation"();
CREATE TRIGGER "stock_transfers_immutable_trigger" BEFORE UPDATE OR DELETE ON "stock_transfers" FOR EACH ROW EXECUTE FUNCTION "reject_posted_inventory_document_mutation"();
CREATE TRIGGER "stock_transfer_lines_immutable_trigger" BEFORE UPDATE OR DELETE ON "stock_transfer_lines" FOR EACH ROW EXECUTE FUNCTION "reject_posted_inventory_document_mutation"();
CREATE TRIGGER "inventory_write_downs_immutable_trigger" BEFORE UPDATE OR DELETE ON "inventory_write_downs" FOR EACH ROW EXECUTE FUNCTION "reject_posted_inventory_document_mutation"();
CREATE TRIGGER "inventory_write_down_lines_immutable_trigger" BEFORE UPDATE OR DELETE ON "inventory_write_down_lines" FOR EACH ROW EXECUTE FUNCTION "reject_posted_inventory_document_mutation"();

CREATE FUNCTION "reject_approved_stock_count_mutation"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'approved' THEN
    RAISE EXCEPTION 'INVENTORY_DOCUMENT_IMMUTABLE: approved stock counts cannot be updated or deleted' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "stock_counts_immutable_trigger" BEFORE UPDATE OR DELETE ON "stock_counts" FOR EACH ROW EXECUTE FUNCTION "reject_approved_stock_count_mutation"();

CREATE FUNCTION "reject_approved_stock_count_line_mutation"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "stock_counts" WHERE "id" = OLD."count_id" AND "status" = 'approved') THEN
    RAISE EXCEPTION 'INVENTORY_DOCUMENT_IMMUTABLE: approved stock-count lines cannot be updated or deleted' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "stock_count_lines_immutable_trigger" BEFORE UPDATE OR DELETE ON "stock_count_lines" FOR EACH ROW EXECUTE FUNCTION "reject_approved_stock_count_line_mutation"();

INSERT INTO "permissions" ("key", "group", "description") VALUES
  ('inventory.view', 'inventory', 'View warehouses, lots, balances and movements'),
  ('inventory.manage', 'inventory', 'Manage warehouses, locations and opening stock'),
  ('inventory.write_down', 'inventory', 'Write down damaged or expired inventory')
ON CONFLICT ("key") DO UPDATE SET "group" = EXCLUDED."group", "description" = EXCLUDED."description";

INSERT INTO "preset_permissions" ("preset_id", "permission_id")
SELECT pp."id", p."id" FROM "permission_presets" pp CROSS JOIN "permissions" p
WHERE pp."name" IN ('super_admin','stock_controller')
  AND p."key" IN ('inventory.view','inventory.manage','inventory.write_down')
ON CONFLICT DO NOTHING;
