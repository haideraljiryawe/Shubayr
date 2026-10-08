-- Phase 8d: immutable custody exception and reversal documents.

ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_phase6_check";
ALTER TABLE "stock_movements" ALTER COLUMN "type" TYPE VARCHAR(40);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_phase8d_check" CHECK (
  "type" IN (
    'receive','reserve','release','issue_to_custody','custody_to_sold',
    'return_in','return_to_supplier','transfer','adjust','write_down',
    'custody_exception','custody_exception_reversal','return_reversal'
  )
);

ALTER TABLE "custody_holdings" DROP CONSTRAINT "custody_holdings_values_check";
ALTER TABLE "custody_holdings" ADD CONSTRAINT "custody_holdings_phase8d_values_check" CHECK (
  "quantity" > 0 AND "unit_cost_iqd" >= 0
  AND "status" IN ('in_custody','sold','returned','exception')
);

CREATE TABLE "custody_exceptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_number" VARCHAR(40) NOT NULL,
  "operation_id" VARCHAR(128) NOT NULL,
  "type" VARCHAR(40) NOT NULL,
  "party_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "collection_id" UUID,
  "liability_bearer" VARCHAR(16),
  "settlement_method" VARCHAR(24),
  "cash_account_id" UUID,
  "amount_iqd" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "goods_cost_iqd" DECIMAL(30,12) NOT NULL DEFAULT 0,
  "exception_offset_iqd" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "refund_payable_iqd" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "reason" VARCHAR(500) NOT NULL,
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "backdate_reason" VARCHAR(500),
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "custody_exceptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "custody_exceptions_document_number_key" UNIQUE ("document_number"),
  CONSTRAINT "custody_exceptions_operation_id_key" UNIQUE ("operation_id"),
  CONSTRAINT "custody_exceptions_type_check" CHECK ("type" IN ('goods_loss','return_against_uncollected','delivery_fee_refund')),
  CONSTRAINT "custody_exceptions_liability_check" CHECK ("liability_bearer" IS NULL OR "liability_bearer" IN ('store','party')),
  CONSTRAINT "custody_exceptions_settlement_check" CHECK ("settlement_method" IS NULL OR "settlement_method" IN ('cash_account','uncollected')),
  CONSTRAINT "custody_exceptions_amounts_check" CHECK ("amount_iqd" >= 0 AND "goods_cost_iqd" >= 0 AND "exception_offset_iqd" >= 0 AND "refund_payable_iqd" >= 0),
  CONSTRAINT "custody_exceptions_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "delivery_parties"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "custody_exceptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "custody_exceptions_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "delivery_collections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "custody_exceptions_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "custody_exceptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "idx_custody_exceptions_type_date" ON "custody_exceptions"("type", "document_date" DESC, "id");
CREATE INDEX "idx_custody_exceptions_party_date" ON "custody_exceptions"("party_id", "document_date" DESC, "id");
CREATE INDEX "idx_custody_exceptions_order_date" ON "custody_exceptions"("order_id", "document_date" DESC, "id");

CREATE TABLE "custody_exception_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "exception_id" UUID NOT NULL,
  "custody_holding_id" UUID NOT NULL,
  "order_item_id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "location_id" UUID,
  "quantity" DECIMAL(20,3) NOT NULL,
  "unit_cost_iqd" DECIMAL(30,12) NOT NULL,
  "return_amount_iqd" DECIMAL(20,6) NOT NULL DEFAULT 0,
  CONSTRAINT "custody_exception_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "custody_exception_lines_exception_holding_key" UNIQUE ("exception_id", "custody_holding_id"),
  CONSTRAINT "custody_exception_lines_values_check" CHECK ("quantity" > 0 AND "unit_cost_iqd" >= 0 AND "return_amount_iqd" >= 0),
  CONSTRAINT "custody_exception_lines_exception_id_fkey" FOREIGN KEY ("exception_id") REFERENCES "custody_exceptions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "custody_exception_lines_holding_id_fkey" FOREIGN KEY ("custody_holding_id") REFERENCES "custody_holdings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "custody_exception_lines_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "custody_exception_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "custody_exception_lines_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "warehouse_locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "idx_custody_exception_lines_holding" ON "custody_exception_lines"("custody_holding_id");

CREATE TABLE "custody_exception_postings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "exception_id" UUID NOT NULL,
  "role" VARCHAR(40) NOT NULL,
  "journal_entry_id" UUID NOT NULL,
  CONSTRAINT "custody_exception_postings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "custody_exception_postings_journal_key" UNIQUE ("journal_entry_id"),
  CONSTRAINT "custody_exception_postings_exception_role_key" UNIQUE ("exception_id", "role"),
  CONSTRAINT "custody_exception_postings_exception_id_fkey" FOREIGN KEY ("exception_id") REFERENCES "custody_exceptions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "custody_exception_postings_journal_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE "custody_exception_reversals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_number" VARCHAR(40) NOT NULL,
  "operation_id" VARCHAR(128) NOT NULL,
  "exception_id" UUID NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "custody_exception_reversals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "custody_exception_reversals_document_number_key" UNIQUE ("document_number"),
  CONSTRAINT "custody_exception_reversals_operation_id_key" UNIQUE ("operation_id"),
  CONSTRAINT "custody_exception_reversals_exception_id_key" UNIQUE ("exception_id"),
  CONSTRAINT "custody_exception_reversals_exception_id_fkey" FOREIGN KEY ("exception_id") REFERENCES "custody_exceptions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "custody_exception_reversals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "idx_custody_exception_reversals_date" ON "custody_exception_reversals"("document_date" DESC, "id");

CREATE TABLE "custody_exception_reversal_postings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reversal_id" UUID NOT NULL,
  "role" VARCHAR(40) NOT NULL,
  "journal_entry_id" UUID NOT NULL,
  "original_journal_entry_id" UUID NOT NULL,
  CONSTRAINT "custody_exception_reversal_postings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "custody_exception_reversal_postings_journal_key" UNIQUE ("journal_entry_id"),
  CONSTRAINT "custody_exception_reversal_postings_original_key" UNIQUE ("original_journal_entry_id"),
  CONSTRAINT "custody_exception_reversal_postings_reversal_role_key" UNIQUE ("reversal_id", "role"),
  CONSTRAINT "custody_exception_reversal_postings_reversal_id_fkey" FOREIGN KEY ("reversal_id") REFERENCES "custody_exception_reversals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "custody_exception_reversal_postings_journal_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "custody_exception_reversal_postings_original_id_fkey" FOREIGN KEY ("original_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE FUNCTION "reject_custody_exception_document_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'custody exception documents are immutable; use a reversal' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "custody_exceptions_immutable_trigger" BEFORE UPDATE OR DELETE ON "custody_exceptions" FOR EACH ROW EXECUTE FUNCTION "reject_custody_exception_document_mutation"();
CREATE TRIGGER "custody_exception_lines_immutable_trigger" BEFORE UPDATE OR DELETE ON "custody_exception_lines" FOR EACH ROW EXECUTE FUNCTION "reject_custody_exception_document_mutation"();
CREATE TRIGGER "custody_exception_postings_immutable_trigger" BEFORE UPDATE OR DELETE ON "custody_exception_postings" FOR EACH ROW EXECUTE FUNCTION "reject_custody_exception_document_mutation"();
CREATE TRIGGER "custody_exception_reversals_immutable_trigger" BEFORE UPDATE OR DELETE ON "custody_exception_reversals" FOR EACH ROW EXECUTE FUNCTION "reject_custody_exception_document_mutation"();
CREATE TRIGGER "custody_exception_reversal_postings_immutable_trigger" BEFORE UPDATE OR DELETE ON "custody_exception_reversal_postings" FOR EACH ROW EXECUTE FUNCTION "reject_custody_exception_document_mutation"();

INSERT INTO "permissions" ("key", "group", "description") VALUES
  ('custody_exceptions.view', 'deliveries', 'View custody exceptions'),
  ('custody_exceptions.loss', 'deliveries', 'Record lost or damaged goods in delivery custody'),
  ('custody_exceptions.return_uncollected', 'deliveries', 'Record a return against an uncollected order'),
  ('custody_exceptions.refund_delivery_fee', 'deliveries', 'Refund an order delivery fee'),
  ('custody_exceptions.reverse', 'deliveries', 'Reverse custody exception documents')
ON CONFLICT ("key") DO UPDATE SET "group"=EXCLUDED."group", "description"=EXCLUDED."description";

INSERT INTO "preset_permissions" ("preset_id", "permission_id")
SELECT preset."id", permission."id"
FROM "permission_presets" preset
CROSS JOIN "permissions" permission
WHERE preset."name" IN ('super_admin', 'cashier', 'accountant')
  AND permission."key" IN (
    'deliveries.manage', 'inventory.view', 'cash_accounts.view',
    'custody_exceptions.view', 'custody_exceptions.loss',
    'custody_exceptions.return_uncollected',
    'custody_exceptions.refund_delivery_fee', 'custody_exceptions.reverse'
  )
ON CONFLICT ("preset_id", "permission_id") DO NOTHING;
