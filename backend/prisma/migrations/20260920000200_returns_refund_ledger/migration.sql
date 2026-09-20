-- The return endpoints were not implemented before this migration. Preserve
-- any out-of-band rows: copy immutable order-item prices and the header reason
-- into the new line columns. Do not invent approved quantities or refunds for
-- historical rows; those need a manual review before processing.
ALTER TABLE "returns"
  ALTER COLUMN "status" TYPE VARCHAR(30),
  ADD COLUMN "expected_refund" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "refund_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "reviewed_by" UUID,
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(6),
  ADD COLUMN "completed_at" TIMESTAMPTZ(6);

ALTER TABLE "return_items"
  ADD COLUMN "approved_quantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "customer_reason" TEXT,
  ADD COLUMN "unit_price" DECIMAL(12,2),
  ALTER COLUMN "condition" DROP NOT NULL;

UPDATE "return_items" AS ri
SET "customer_reason" = COALESCE(NULLIF(r."reason", ''), 'Legacy return request'),
    "unit_price" = oi."unit_price"
FROM "returns" AS r, "order_items" AS oi
WHERE ri."return_id" = r."id" AND ri."order_item_id" = oi."id";

ALTER TABLE "return_items"
  ALTER COLUMN "customer_reason" SET NOT NULL,
  ALTER COLUMN "unit_price" SET NOT NULL;

UPDATE "returns" AS r
SET "expected_refund" = amounts.amount
FROM (
  SELECT ri."return_id", SUM(ri."quantity" * ri."unit_price") AS amount
  FROM "return_items" AS ri GROUP BY ri."return_id"
) AS amounts
WHERE r."id" = amounts."return_id";

ALTER TABLE "return_items" ADD CONSTRAINT "return_items_approved_quantity_check"
  CHECK ("approved_quantity" >= 0 AND "approved_quantity" <= "quantity");
CREATE UNIQUE INDEX "return_items_return_id_order_item_id_key"
  ON "return_items"("return_id", "order_item_id");
ALTER TABLE "returns" ADD CONSTRAINT "returns_reviewed_by_fkey"
  FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "stock_movements" ADD COLUMN "return_item_id" UUID;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_return_item_id_fkey"
  FOREIGN KEY ("return_item_id") REFERENCES "return_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE INDEX "idx_movements_return_item" ON "stock_movements"("return_item_id");

-- COD refunds are obligations recorded in this ledger, never gateway reversals.
CREATE TABLE "refund_ledger" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "return_id" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'obligation',
  "reason" TEXT NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refund_ledger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "refund_ledger_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "refund_ledger_status_check" CHECK ("status" = 'obligation')
);
CREATE UNIQUE INDEX "refund_ledger_return_id_key" ON "refund_ledger"("return_id");
CREATE INDEX "idx_refund_ledger_order" ON "refund_ledger"("order_id");
ALTER TABLE "refund_ledger" ADD CONSTRAINT "refund_ledger_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "refund_ledger" ADD CONSTRAINT "refund_ledger_return_id_fkey"
  FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "refund_ledger" ADD CONSTRAINT "refund_ledger_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
