-- Phase 8c: immutable cash receipt, allocation and reversal documents.

CREATE TABLE "cash_receipt_vouchers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_number" VARCHAR(40) NOT NULL,
  "operation_id" VARCHAR(128) NOT NULL,
  "party_id" UUID NOT NULL,
  "cash_account_id" UUID NOT NULL,
  "amount_iqd" DECIMAL(20,6) NOT NULL,
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "backdate_reason" VARCHAR(500),
  "reference" VARCHAR(160),
  "notes" TEXT,
  "created_by" UUID NOT NULL,
  "journal_entry_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_receipt_vouchers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_receipt_vouchers_document_number_key" UNIQUE ("document_number"),
  CONSTRAINT "cash_receipt_vouchers_operation_id_key" UNIQUE ("operation_id"),
  CONSTRAINT "cash_receipt_vouchers_journal_entry_id_key" UNIQUE ("journal_entry_id"),
  CONSTRAINT "cash_receipt_vouchers_amount_check" CHECK ("amount_iqd" > 0),
  CONSTRAINT "cash_receipt_vouchers_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "delivery_parties"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "cash_receipt_vouchers_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "cash_receipt_vouchers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "cash_receipt_vouchers_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "idx_cash_receipt_vouchers_party_date" ON "cash_receipt_vouchers"("party_id", "document_date" DESC, "id");
CREATE INDEX "idx_cash_receipt_vouchers_account_date" ON "cash_receipt_vouchers"("cash_account_id", "document_date" DESC, "id");

CREATE TABLE "cash_receipt_allocation_batches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_number" VARCHAR(40) NOT NULL,
  "operation_id" VARCHAR(128) NOT NULL,
  "voucher_id" UUID NOT NULL,
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "backdate_reason" VARCHAR(500),
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_receipt_allocation_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_receipt_allocation_batches_document_number_key" UNIQUE ("document_number"),
  CONSTRAINT "cash_receipt_allocation_batches_operation_id_key" UNIQUE ("operation_id"),
  CONSTRAINT "cash_receipt_allocation_batches_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "cash_receipt_vouchers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "cash_receipt_allocation_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "idx_cash_receipt_allocation_batches_voucher" ON "cash_receipt_allocation_batches"("voucher_id", "created_at", "id");

CREATE TABLE "cash_receipt_allocations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "batch_id" UUID NOT NULL,
  "collection_id" UUID NOT NULL,
  "amount_iqd" DECIMAL(20,6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_receipt_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_receipt_allocations_batch_collection_key" UNIQUE ("batch_id", "collection_id"),
  CONSTRAINT "cash_receipt_allocations_amount_check" CHECK ("amount_iqd" > 0),
  CONSTRAINT "cash_receipt_allocations_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "cash_receipt_allocation_batches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "cash_receipt_allocations_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "delivery_collections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "idx_cash_receipt_allocations_collection" ON "cash_receipt_allocations"("collection_id");

CREATE TABLE "cash_receipt_reversals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_number" VARCHAR(40) NOT NULL,
  "operation_id" VARCHAR(128) NOT NULL,
  "voucher_id" UUID NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "created_by" UUID NOT NULL,
  "journal_entry_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_receipt_reversals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_receipt_reversals_document_number_key" UNIQUE ("document_number"),
  CONSTRAINT "cash_receipt_reversals_operation_id_key" UNIQUE ("operation_id"),
  CONSTRAINT "cash_receipt_reversals_voucher_id_key" UNIQUE ("voucher_id"),
  CONSTRAINT "cash_receipt_reversals_journal_entry_id_key" UNIQUE ("journal_entry_id"),
  CONSTRAINT "cash_receipt_reversals_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "cash_receipt_vouchers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "cash_receipt_reversals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "cash_receipt_reversals_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "idx_cash_receipt_reversals_date" ON "cash_receipt_reversals"("document_date" DESC, "id");

CREATE FUNCTION "reject_cash_receipt_document_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'cash receipt documents are immutable; use a reversal' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "cash_receipt_vouchers_immutable_trigger" BEFORE UPDATE OR DELETE ON "cash_receipt_vouchers" FOR EACH ROW EXECUTE FUNCTION "reject_cash_receipt_document_mutation"();
CREATE TRIGGER "cash_receipt_allocation_batches_immutable_trigger" BEFORE UPDATE OR DELETE ON "cash_receipt_allocation_batches" FOR EACH ROW EXECUTE FUNCTION "reject_cash_receipt_document_mutation"();
CREATE TRIGGER "cash_receipt_allocations_immutable_trigger" BEFORE UPDATE OR DELETE ON "cash_receipt_allocations" FOR EACH ROW EXECUTE FUNCTION "reject_cash_receipt_document_mutation"();
CREATE TRIGGER "cash_receipt_reversals_immutable_trigger" BEFORE UPDATE OR DELETE ON "cash_receipt_reversals" FOR EACH ROW EXECUTE FUNCTION "reject_cash_receipt_document_mutation"();

INSERT INTO "permissions" ("key", "group", "description") VALUES
  ('cash_receipts.receive', 'deliveries', 'Receive delivery-party cash into a cash account'),
  ('cash_receipts.allocate', 'deliveries', 'Allocate cash receipts to delivered orders'),
  ('cash_receipts.reverse', 'deliveries', 'Reverse delivery-party cash receipt vouchers')
ON CONFLICT ("key") DO UPDATE SET
  "group" = EXCLUDED."group",
  "description" = EXCLUDED."description";

INSERT INTO "preset_permissions" ("preset_id", "permission_id")
SELECT preset."id", permission."id"
FROM "permission_presets" preset
CROSS JOIN "permissions" permission
WHERE preset."name" IN ('super_admin', 'cashier', 'accountant')
  AND permission."key" IN (
    'deliveries.manage',
    'cash_receipts.receive',
    'cash_receipts.allocate',
    'cash_receipts.reverse'
  )
ON CONFLICT ("preset_id", "permission_id") DO NOTHING;
