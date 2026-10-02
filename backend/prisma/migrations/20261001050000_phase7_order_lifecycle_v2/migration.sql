-- Phase 7: order lifecycle v2.
-- Existing orders keep their shipped status vocabulary. Version 1 is the
-- backfill baseline; existing in-custody rows start with their full issued
-- quantity outstanding.

ALTER TABLE "cart_items"
  ADD COLUMN "price_version" VARCHAR(64) NOT NULL DEFAULT '';

ALTER TABLE "orders"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "acceptance_deadline" TIMESTAMPTZ(6),
  ADD COLUMN "auto_cancel_deadline" TIMESTAMPTZ(6),
  ADD COLUMN "late_for_acceptance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "acceptance_alerted_at" TIMESTAMPTZ(6),
  ADD COLUMN "cancellation_request_status" VARCHAR(20),
  ADD COLUMN "cancellation_request_reason" VARCHAR(500),
  ADD COLUMN "cancellation_requested_at" TIMESTAMPTZ(6),
  ADD COLUMN "cancellation_resolved_at" TIMESTAMPTZ(6),
  ADD COLUMN "cancellation_resolved_by" UUID,
  ADD COLUMN "cancellation_resolution_note" VARCHAR(500),
  ADD COLUMN "price_change_info" JSONB,
  ADD COLUMN "attention_details" JSONB;

ALTER TABLE "order_items"
  ADD COLUMN "price_version" VARCHAR(64) NOT NULL DEFAULT '';

ALTER TABLE "custody_holdings"
  ADD COLUMN "remaining_quantity" NUMERIC(20,3);
UPDATE "custody_holdings"
SET "remaining_quantity" = CASE WHEN "status" = 'in_custody' THEN "quantity" ELSE 0 END;
ALTER TABLE "custody_holdings"
  ALTER COLUMN "remaining_quantity" SET NOT NULL;

ALTER TABLE "pick_lists"
  ADD COLUMN "completed_at" TIMESTAMPTZ(6);
CREATE UNIQUE INDEX "pick_lists_order_id_key" ON "pick_lists"("order_id");

ALTER TABLE "deliveries"
  ADD COLUMN "failure_reason" VARCHAR(500),
  ADD COLUMN "failed_at" TIMESTAMPTZ(6),
  ADD COLUMN "retry_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "retrievals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_number" VARCHAR(40) NOT NULL,
  "operation_id" VARCHAR(128) NOT NULL,
  "order_id" UUID NOT NULL,
  "delivery_id" UUID NOT NULL,
  "custody_party_id" UUID NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'open',
  "outcome" VARCHAR(16) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_by" UUID,
  "closed_at" TIMESTAMPTZ(6),
  "journal_entry_id" UUID,
  CONSTRAINT "retrievals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "retrievals_document_number_key" UNIQUE ("document_number"),
  CONSTRAINT "retrievals_operation_id_key" UNIQUE ("operation_id"),
  CONSTRAINT "retrievals_journal_entry_id_key" UNIQUE ("journal_entry_id"),
  CONSTRAINT "retrievals_status_check" CHECK ("status" IN ('open','partially_received','received','closed')),
  CONSTRAINT "retrievals_outcome_check" CHECK ("outcome" IN ('cancel','retry')),
  CONSTRAINT "retrievals_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION,
  CONSTRAINT "retrievals_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE NO ACTION,
  CONSTRAINT "retrievals_custody_party_id_fkey" FOREIGN KEY ("custody_party_id") REFERENCES "users"("id") ON DELETE NO ACTION,
  CONSTRAINT "retrievals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION,
  CONSTRAINT "retrievals_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE NO ACTION,
  CONSTRAINT "retrievals_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION
);

CREATE TABLE "retrieval_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "retrieval_id" UUID NOT NULL,
  "custody_holding_id" UUID NOT NULL,
  "order_item_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "expected_quantity" NUMERIC(20,3) NOT NULL,
  "received_quantity" NUMERIC(20,3) NOT NULL DEFAULT 0,
  "unit_cost_iqd" NUMERIC(30,12) NOT NULL,
  "location_id" UUID,
  "received_at" TIMESTAMPTZ(6),
  CONSTRAINT "retrieval_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "retrieval_lines_retrieval_holding_key" UNIQUE ("retrieval_id","custody_holding_id"),
  CONSTRAINT "retrieval_lines_quantity_check" CHECK (
    "expected_quantity" > 0 AND "received_quantity" >= 0 AND "received_quantity" <= "expected_quantity"
  ),
  CONSTRAINT "retrieval_lines_retrieval_id_fkey" FOREIGN KEY ("retrieval_id") REFERENCES "retrievals"("id") ON DELETE CASCADE,
  CONSTRAINT "retrieval_lines_custody_holding_id_fkey" FOREIGN KEY ("custody_holding_id") REFERENCES "custody_holdings"("id") ON DELETE NO ACTION,
  CONSTRAINT "retrieval_lines_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE NO ACTION,
  CONSTRAINT "retrieval_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION,
  CONSTRAINT "retrieval_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE NO ACTION,
  CONSTRAINT "retrieval_lines_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "warehouse_locations"("id") ON DELETE NO ACTION
);

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "orders_cancellation_request_status_check" CHECK (
    "cancellation_request_status" IS NULL OR "cancellation_request_status" IN ('pending','approved','denied')
  );
ALTER TABLE "custody_holdings"
  ADD CONSTRAINT "custody_holdings_remaining_check" CHECK (
    "remaining_quantity" >= 0 AND "remaining_quantity" <= "quantity"
  );
ALTER TABLE "deliveries"
  ADD CONSTRAINT "deliveries_retry_count_check" CHECK ("retry_count" >= 0);

CREATE INDEX "idx_orders_acceptance_deadline" ON "orders"("status","acceptance_deadline");
CREATE INDEX "idx_orders_auto_cancel_deadline" ON "orders"("status","auto_cancel_deadline");
CREATE INDEX "idx_retrievals_order_status" ON "retrievals"("order_id","status");
CREATE INDEX "idx_retrievals_party_status" ON "retrievals"("custody_party_id","status");
CREATE INDEX "idx_retrieval_lines_document" ON "retrieval_lines"("retrieval_id");

INSERT INTO "permissions" ("key", "group", "description") VALUES
  ('orders.cancel_request.resolve','orders','Approve or deny cancellation requests'),
  ('orders.deliver','orders','Mark a dispatched order delivered'),
  ('orders.fail','orders','Record a failed delivery'),
  ('orders.retry','orders','Retry a failed delivery'),
  ('orders.cancel_after_dispatch','orders','Cancel an order after dispatch'),
  ('orders.shortage.resolve','orders','Resolve preparation shortages'),
  ('sell_below_cost.approve','catalog','Approve a sale below protected cost'),
  ('retrieval.view','inventory','View retrieval documents'),
  ('retrieval.open','inventory','Open failed-delivery retrievals'),
  ('retrieval.receive','inventory','Receive goods from delivery custody')
ON CONFLICT ("key") DO UPDATE SET
  "group" = EXCLUDED."group",
  "description" = EXCLUDED."description";
