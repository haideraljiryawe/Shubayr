-- Phase 9 returns v2: durable transition events, exact paid-share snapshots,
-- inspected inventory disposition, loyalty effects and refund payments.

ALTER TABLE "orders"
  ADD COLUMN "loyalty_points_redeemed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "loyalty_redemption_amount" DECIMAL(20,6) NOT NULL DEFAULT 0,
  ADD CONSTRAINT "orders_loyalty_redemption_check" CHECK (
    "loyalty_points_redeemed" >= 0
    AND "loyalty_redemption_amount" >= 0
    AND "loyalty_redemption_amount" <= "subtotal" - "discount"
  );

ALTER TABLE "loyalty_ledger"
  DROP CONSTRAINT "loyalty_ledger_type_points_check",
  ADD CONSTRAINT "loyalty_ledger_type_points_check" CHECK (
       ("type" = 'earn' AND "points" > 0 AND "order_id" IS NOT NULL)
    OR ("type" = 'redeem' AND "points" < 0)
    OR ("type" = 'adjust' AND "points" <> 0)
    OR ("type" = 'expire' AND "points" < 0)
    OR ("type" = 'return_reversal' AND "points" < 0 AND "return_id" IS NOT NULL)
    OR ("type" = 'return_restore' AND "points" > 0 AND "return_id" IS NOT NULL)
  );

ALTER TABLE "order_items"
  ADD COLUMN "coupon_discount_share" DECIMAL(20,6) NOT NULL DEFAULT 0,
  ADD COLUMN "tier_discount_share" DECIMAL(20,6) NOT NULL DEFAULT 0,
  ADD COLUMN "loyalty_discount_share" DECIMAL(20,6) NOT NULL DEFAULT 0,
  ADD COLUMN "other_adjustment_share" DECIMAL(20,6) NOT NULL DEFAULT 0,
  ADD COLUMN "net_paid_total" DECIMAL(20,6) NOT NULL DEFAULT 0;

UPDATE "order_items" oi SET
  "coupon_discount_share" = CASE WHEN o."discount_source" IN ('coupon', 'stacked') THEN oi."discount_share" ELSE 0 END,
  "tier_discount_share" = CASE WHEN o."discount_source" = 'tier' THEN oi."discount_share" ELSE 0 END,
  "net_paid_total" = oi."net_line_total"
FROM "orders" o
WHERE o."id" = oi."order_id";

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_paid_allocations_check" CHECK (
    "coupon_discount_share" >= 0
    AND "tier_discount_share" >= 0
    AND "loyalty_discount_share" >= 0
    AND "other_adjustment_share" >= 0
    AND "net_paid_total" >= 0
  );

ALTER TABLE "returns"
  ADD COLUMN "document_number" VARCHAR(40),
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "source" VARCHAR(20) NOT NULL DEFAULT 'customer',
  ADD COLUMN "delivery_fee_refund" DECIMAL(20,6) NOT NULL DEFAULT 0,
  ADD COLUMN "uncollected_offset" DECIMAL(20,6) NOT NULL DEFAULT 0,
  ADD COLUMN "cash_refund_amount" DECIMAL(20,6) NOT NULL DEFAULT 0,
  ADD COLUMN "points_earned_reversed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "points_redeemed_restored" INTEGER NOT NULL DEFAULT 0;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS sequence
  FROM "returns"
)
UPDATE "returns" r SET
  "document_number" = 'RET-LEGACY-' || lpad(numbered.sequence::text, 6, '0'),
  "created_by" = r."user_id"
FROM numbered
WHERE numbered.id = r.id;

ALTER TABLE "returns"
  ALTER COLUMN "document_number" SET NOT NULL,
  ALTER COLUMN "created_by" SET NOT NULL,
  ADD CONSTRAINT "returns_document_number_key" UNIQUE ("document_number"),
  ADD CONSTRAINT "returns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "returns_v2_status_check" CHECK ("status" IN (
    'requested', 'approved', 'partially_approved', 'rejected',
    'received', 'inspected', 'refunded', 'completed'
  )),
  ADD CONSTRAINT "returns_source_check" CHECK ("source" IN ('customer', 'staff')),
  ADD CONSTRAINT "returns_v2_values_check" CHECK (
    "expected_refund" >= 0
    AND "refund_amount" >= 0
    AND "delivery_fee_refund" >= 0
    AND "uncollected_offset" >= 0
    AND "cash_refund_amount" >= 0
    AND "points_earned_reversed" >= 0
    AND "points_redeemed_restored" >= 0
  );

ALTER TABLE "return_items"
  ADD COLUMN "reason_code" VARCHAR(24) NOT NULL DEFAULT 'other',
  ADD COLUMN "allocation_start_quantity" DECIMAL(20,3) NOT NULL DEFAULT 0,
  ADD COLUMN "approved_refund" DECIMAL(20,6) NOT NULL DEFAULT 0,
  ADD COLUMN "earned_points_share" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "redeemed_points_share" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "issue_cost_value" DECIMAL(20,6) NOT NULL DEFAULT 0,
  ADD COLUMN "inspection_location_id" UUID,
  ADD CONSTRAINT "return_items_inspection_location_id_fkey" FOREIGN KEY ("inspection_location_id") REFERENCES "warehouse_locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

UPDATE "return_items" SET "approved_refund" = CASE
  WHEN "quantity" = 0 THEN 0
  ELSE round("net_amount" * "approved_quantity" / "quantity", 6)
END;

ALTER TABLE "return_items"
  ADD CONSTRAINT "return_items_v2_reason_check" CHECK (
    "reason_code" IN ('change_of_mind', 'defect', 'store_error', 'wrong_item', 'other')
  ),
  ADD CONSTRAINT "return_items_v2_condition_check" CHECK (
    "condition" IS NULL OR "condition" IN ('sellable', 'opened', 'damaged', 'expired')
  ),
  ADD CONSTRAINT "return_items_v2_values_check" CHECK (
    "allocation_start_quantity" >= 0
    AND "approved_refund" >= 0
    AND "earned_points_share" >= 0
    AND "redeemed_points_share" >= 0
    AND "issue_cost_value" >= 0
  );

CREATE TABLE "return_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "return_id" UUID NOT NULL,
  "type" VARCHAR(30) NOT NULL,
  "operation_id" VARCHAR(128) NOT NULL,
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "note" VARCHAR(500),
  "actor_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "return_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "return_events_operation_id_key" UNIQUE ("operation_id"),
  CONSTRAINT "return_events_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "return_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "idx_return_events_return" ON "return_events"("return_id", "created_at", "id");
ALTER TABLE "return_events" ADD CONSTRAINT "return_events_type_check" CHECK (
  "type" IN ('requested', 'approved', 'partially_approved', 'rejected', 'received', 'inspected', 'refunded')
);

CREATE TABLE "return_postings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "return_id" UUID NOT NULL,
  "role" VARCHAR(64) NOT NULL,
  "journal_entry_id" UUID NOT NULL,
  CONSTRAINT "return_postings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "return_postings_journal_key" UNIQUE ("journal_entry_id"),
  CONSTRAINT "return_postings_return_role_key" UNIQUE ("return_id", "role"),
  CONSTRAINT "return_postings_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "return_postings_journal_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE "return_refund_payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "return_id" UUID NOT NULL,
  "operation_id" VARCHAR(128) NOT NULL,
  "method" VARCHAR(24) NOT NULL,
  "amount_iqd" DECIMAL(20,6) NOT NULL,
  "cash_account_id" UUID,
  "collection_id" UUID,
  "proof_reference" VARCHAR(160),
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "created_by" UUID NOT NULL,
  "journal_entry_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "return_refund_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "return_refund_payments_operation_id_key" UNIQUE ("operation_id"),
  CONSTRAINT "return_refund_payments_journal_key" UNIQUE ("journal_entry_id"),
  CONSTRAINT "return_refund_payments_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "return_refund_payments_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "return_refund_payments_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "delivery_collections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "return_refund_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "return_refund_payments_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "return_refund_payments_positive_check" CHECK ("amount_iqd" > 0),
  CONSTRAINT "return_refund_payments_method_check" CHECK (
    ("method" = 'cash_account' AND "cash_account_id" IS NOT NULL AND "collection_id" IS NULL) OR
    ("method" = 'delivery_custody' AND "collection_id" IS NOT NULL AND "cash_account_id" IS NULL)
  )
);
CREATE INDEX "idx_return_refund_payments_return" ON "return_refund_payments"("return_id", "created_at", "id");

INSERT INTO "store_settings" ("key", "value") VALUES ('return_window_days', '14')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "permissions" ("key", "group", "description") VALUES
  ('returns.view', 'returns', 'View customer returns'),
  ('returns.create', 'returns', 'Create a return for a customer'),
  ('returns.receive', 'returns', 'Receive approved return goods'),
  ('returns.inspect', 'returns', 'Inspect returned goods'),
  ('returns.approve', 'returns', 'Approve returns'),
  ('returns.refund', 'returns', 'Refund returns'),
  ('returns.refund_delivery_fee', 'returns', 'Authorize a delivery-fee refund exception')
ON CONFLICT ("key") DO UPDATE SET
  "group" = EXCLUDED."group",
  "description" = EXCLUDED."description";

INSERT INTO "preset_permissions" ("preset_id", "permission_id")
SELECT preset."id", permission."id"
FROM "permission_presets" preset
CROSS JOIN "permissions" permission
WHERE preset."name" = 'super_admin'
   OR (
     preset."name" = 'operations'
     AND permission."key" IN (
       'returns.view', 'returns.create', 'returns.receive',
       'returns.inspect', 'returns.approve', 'returns.refund',
       'returns.refund_delivery_fee'
     )
   )
ON CONFLICT ("preset_id", "permission_id") DO NOTHING;
