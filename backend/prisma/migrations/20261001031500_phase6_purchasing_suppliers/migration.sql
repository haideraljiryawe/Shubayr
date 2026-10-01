-- Phase 6: append-only purchasing, supplier subledger, settlements and corrections.

ALTER TABLE "suppliers"
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "default_currency" CHAR(3) NOT NULL DEFAULT 'IQD',
  ADD COLUMN "payment_terms_days" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "purchase_invoices"
  ADD COLUMN "document_number" VARCHAR(40) NOT NULL,
  ADD COLUMN "operation_id" VARCHAR(128) NOT NULL,
  ADD COLUMN "exchange_rate" DECIMAL(24,10) NOT NULL DEFAULT 1,
  ADD COLUMN "subtotal_currency" DECIMAL(20,6) NOT NULL DEFAULT 0,
  ADD COLUMN "landed_cost_currency" DECIMAL(20,6) NOT NULL DEFAULT 0,
  ADD COLUMN "total_iqd" DECIMAL(30,12) NOT NULL DEFAULT 0,
  ADD COLUMN "allocation_method" VARCHAR(16) NOT NULL DEFAULT 'value',
  ADD COLUMN "default_location_id" UUID NOT NULL,
  ADD COLUMN "due_date" DATE,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "backdate_reason" VARCHAR(500),
  ADD COLUMN "journal_entry_id" UUID NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'posted',
  ALTER COLUMN "received_at" SET NOT NULL,
  ALTER COLUMN "received_at" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "created_by" SET NOT NULL,
  ALTER COLUMN "accounting_date" DROP DEFAULT,
  ALTER COLUMN "document_date" DROP DEFAULT;

ALTER TABLE "purchase_invoice_items"
  ADD COLUMN "location_id" UUID NOT NULL,
  ADD COLUMN "purchase_quantity" DECIMAL(20,3) NOT NULL,
  ADD COLUMN "pack_size" DECIMAL(20,3) NOT NULL DEFAULT 1,
  ADD COLUMN "base_unit_cost_currency" DECIMAL(30,12) NOT NULL,
  ADD COLUMN "line_total_currency" DECIMAL(30,12) NOT NULL,
  ADD COLUMN "landed_cost_share_iqd" DECIMAL(30,12) NOT NULL DEFAULT 0,
  ADD COLUMN "landed_unit_cost_iqd" DECIMAL(30,12) NOT NULL,
  ADD COLUMN "lot_id" UUID;

CREATE TABLE "purchase_landed_costs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoice_id" UUID NOT NULL,
  "kind" VARCHAR(40) NOT NULL,
  "description" VARCHAR(300),
  "amount_currency" DECIMAL(20,6) NOT NULL,
  "amount_iqd" DECIMAL(30,12) NOT NULL,
  "currency_code" CHAR(3) NOT NULL
);

CREATE TABLE "supplier_opening_balances" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_number" VARCHAR(40) NOT NULL,
  "operation_id" VARCHAR(128) NOT NULL,
  "supplier_id" UUID NOT NULL,
  "currency_code" CHAR(3) NOT NULL,
  "amount_currency" DECIMAL(20,6) NOT NULL,
  "exchange_rate" DECIMAL(24,10) NOT NULL,
  "amount_iqd" DECIMAL(30,12) NOT NULL,
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "due_date" DATE,
  "backdate_reason" VARCHAR(500),
  "created_by" UUID NOT NULL,
  "journal_entry_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "supplier_account_entries" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "supplier_id" UUID NOT NULL,
  "source_type" VARCHAR(40) NOT NULL,
  "source_id" UUID NOT NULL,
  "document_number" VARCHAR(40) NOT NULL,
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "due_date" DATE,
  "currency_code" CHAR(3) NOT NULL,
  "debit_currency" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "credit_currency" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "debit_iqd" DECIMAL(30,12) NOT NULL DEFAULT 0,
  "credit_iqd" DECIMAL(30,12) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "purchase_invoice_id" UUID,
  "opening_balance_id" UUID,
  "payment_id" UUID,
  "credit_id" UUID,
  "return_id" UUID
);

CREATE TABLE "supplier_payments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_number" VARCHAR(40) NOT NULL,
  "operation_id" VARCHAR(128) NOT NULL,
  "supplier_id" UUID NOT NULL,
  "cash_account_id" UUID NOT NULL,
  "currency_code" CHAR(3) NOT NULL,
  "amount_currency" DECIMAL(20,6) NOT NULL,
  "exchange_rate" DECIMAL(24,10) NOT NULL,
  "amount_iqd" DECIMAL(30,12) NOT NULL,
  "allocated_currency" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "unallocated_currency" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "reference" VARCHAR(160),
  "notes" TEXT,
  "created_by" UUID NOT NULL,
  "journal_entry_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "supplier_payment_allocations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "payment_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "amount_invoice_currency" DECIMAL(20,6) NOT NULL,
  "invoice_carrying_iqd" DECIMAL(30,12) NOT NULL,
  "payment_iqd" DECIMAL(30,12) NOT NULL,
  "fx_difference_iqd" DECIMAL(30,12) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "supplier_credits" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "supplier_id" UUID NOT NULL,
  "source_type" VARCHAR(30) NOT NULL,
  "source_id" UUID NOT NULL,
  "currency_code" CHAR(3) NOT NULL,
  "amount_currency" DECIMAL(20,6) NOT NULL,
  "remaining_currency" DECIMAL(20,6) NOT NULL,
  "amount_iqd" DECIMAL(30,12) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payment_id" UUID,
  "return_id" UUID
);

CREATE TABLE "supplier_credit_allocations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "credit_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "amount_invoice_currency" DECIMAL(20,6) NOT NULL,
  "amount_credit_currency" DECIMAL(20,6) NOT NULL,
  "amount_iqd" DECIMAL(30,12) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "supplier_returns" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_number" VARCHAR(40) NOT NULL,
  "operation_id" VARCHAR(128) NOT NULL,
  "supplier_id" UUID NOT NULL,
  "invoice_id" UUID,
  "currency_code" CHAR(3) NOT NULL,
  "exchange_rate" DECIMAL(24,10) NOT NULL,
  "total_currency" DECIMAL(20,6) NOT NULL,
  "total_iqd" DECIMAL(30,12) NOT NULL,
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "created_by" UUID NOT NULL,
  "journal_entry_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "supplier_return_lines" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "return_id" UUID NOT NULL,
  "purchase_item_id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "quantity" DECIMAL(20,3) NOT NULL,
  "unit_cost_iqd" DECIMAL(30,12) NOT NULL,
  "amount_iqd" DECIMAL(30,12) NOT NULL
);

CREATE TABLE "purchase_cost_corrections" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_number" VARCHAR(40) NOT NULL,
  "operation_id" VARCHAR(128) NOT NULL,
  "invoice_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "kind" VARCHAR(30) NOT NULL,
  "allocation_method" VARCHAR(16) NOT NULL DEFAULT 'value',
  "amount_iqd" DECIMAL(30,12) NOT NULL,
  "inventory_iqd" DECIMAL(30,12) NOT NULL DEFAULT 0,
  "custody_iqd" DECIMAL(30,12) NOT NULL DEFAULT 0,
  "cogs_iqd" DECIMAL(30,12) NOT NULL DEFAULT 0,
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "created_by" UUID NOT NULL,
  "journal_entry_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "purchase_cost_correction_lines" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "correction_id" UUID NOT NULL,
  "purchase_item_id" UUID NOT NULL,
  "unit_difference_iqd" DECIMAL(30,12) NOT NULL,
  "warehouse_quantity" DECIMAL(20,3) NOT NULL DEFAULT 0,
  "custody_quantity" DECIMAL(20,3) NOT NULL DEFAULT 0,
  "sold_quantity" DECIMAL(20,3) NOT NULL DEFAULT 0,
  "inventory_iqd" DECIMAL(30,12) NOT NULL DEFAULT 0,
  "custody_iqd" DECIMAL(30,12) NOT NULL DEFAULT 0,
  "cogs_iqd" DECIMAL(30,12) NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX "purchase_invoices_document_number_key" ON "purchase_invoices"("document_number");
CREATE UNIQUE INDEX "purchase_invoices_operation_id_key" ON "purchase_invoices"("operation_id");
CREATE UNIQUE INDEX "purchase_invoices_journal_entry_id_key" ON "purchase_invoices"("journal_entry_id");
CREATE UNIQUE INDEX "purchase_invoices_supplier_invoice_number_key" ON "purchase_invoices"("supplier_id", "invoice_number");
CREATE INDEX "idx_purchase_invoices_date" ON "purchase_invoices"("document_date", "id");
CREATE INDEX "idx_purchase_invoices_supplier_status_due" ON "purchase_invoices"("supplier_id", "status", "due_date");
CREATE UNIQUE INDEX "purchase_invoice_items_lot_id_key" ON "purchase_invoice_items"("lot_id");
CREATE INDEX "idx_purchase_invoice_items_invoice" ON "purchase_invoice_items"("invoice_id");
CREATE INDEX "idx_purchase_landed_costs_invoice" ON "purchase_landed_costs"("invoice_id");
CREATE INDEX "idx_suppliers_name" ON "suppliers"("name");
CREATE UNIQUE INDEX "supplier_opening_balances_document_number_key" ON "supplier_opening_balances"("document_number");
CREATE UNIQUE INDEX "supplier_opening_balances_operation_id_key" ON "supplier_opening_balances"("operation_id");
CREATE UNIQUE INDEX "supplier_opening_balances_journal_entry_id_key" ON "supplier_opening_balances"("journal_entry_id");
CREATE INDEX "idx_supplier_openings_supplier_date" ON "supplier_opening_balances"("supplier_id", "document_date");
CREATE UNIQUE INDEX "supplier_account_entries_source_key" ON "supplier_account_entries"("source_type", "source_id");
CREATE INDEX "idx_supplier_account_statement" ON "supplier_account_entries"("supplier_id", "currency_code", "document_date", "id");
CREATE UNIQUE INDEX "supplier_payments_document_number_key" ON "supplier_payments"("document_number");
CREATE UNIQUE INDEX "supplier_payments_operation_id_key" ON "supplier_payments"("operation_id");
CREATE UNIQUE INDEX "supplier_payments_journal_entry_id_key" ON "supplier_payments"("journal_entry_id");
CREATE INDEX "idx_supplier_payments_supplier_date" ON "supplier_payments"("supplier_id", "document_date", "id");
CREATE UNIQUE INDEX "supplier_payment_allocations_payment_invoice_key" ON "supplier_payment_allocations"("payment_id", "invoice_id");
CREATE INDEX "idx_supplier_payment_allocations_invoice" ON "supplier_payment_allocations"("invoice_id");
CREATE INDEX "idx_supplier_credits_open" ON "supplier_credits"("supplier_id", "currency_code", "remaining_currency");
CREATE UNIQUE INDEX "supplier_credit_allocations_credit_invoice_key" ON "supplier_credit_allocations"("credit_id", "invoice_id");
CREATE INDEX "idx_supplier_credit_allocations_invoice" ON "supplier_credit_allocations"("invoice_id");
CREATE UNIQUE INDEX "supplier_returns_document_number_key" ON "supplier_returns"("document_number");
CREATE UNIQUE INDEX "supplier_returns_operation_id_key" ON "supplier_returns"("operation_id");
CREATE UNIQUE INDEX "supplier_returns_journal_entry_id_key" ON "supplier_returns"("journal_entry_id");
CREATE INDEX "idx_supplier_returns_supplier_date" ON "supplier_returns"("supplier_id", "document_date");
CREATE INDEX "idx_supplier_return_lines_return" ON "supplier_return_lines"("return_id");
CREATE UNIQUE INDEX "purchase_cost_corrections_document_number_key" ON "purchase_cost_corrections"("document_number");
CREATE UNIQUE INDEX "purchase_cost_corrections_operation_id_key" ON "purchase_cost_corrections"("operation_id");
CREATE UNIQUE INDEX "purchase_cost_corrections_journal_entry_id_key" ON "purchase_cost_corrections"("journal_entry_id");
CREATE INDEX "idx_purchase_cost_corrections_invoice" ON "purchase_cost_corrections"("invoice_id", "created_at");
CREATE INDEX "idx_purchase_cost_correction_lines_correction" ON "purchase_cost_correction_lines"("correction_id");

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_currency_check" CHECK ("default_currency" IN ('IQD','USD'));
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_payment_terms_check" CHECK ("payment_terms_days" >= 0);
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_currency_check" CHECK ("currency_code" IN ('IQD','USD'));
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_allocation_check" CHECK ("allocation_method" IN ('value','quantity','manual'));
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_values_check" CHECK ("purchase_quantity" > 0 AND "pack_size" > 0 AND "quantity" > 0 AND "unit_cost" > 0 AND "base_unit_cost_currency" > 0);
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_one_side_check" CHECK (("debit_currency" > 0 AND "credit_currency" = 0) OR ("credit_currency" > 0 AND "debit_currency" = 0));
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_amount_check" CHECK ("amount_currency" > 0 AND "exchange_rate" > 0);
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_amount_check" CHECK ("amount_invoice_currency" > 0);
ALTER TABLE "supplier_credits" ADD CONSTRAINT "supplier_credits_amount_check" CHECK ("amount_currency" > 0 AND "remaining_currency" >= 0 AND "remaining_currency" <= "amount_currency");
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "purchase_cost_corrections" ADD CONSTRAINT "purchase_cost_corrections_kind_check" CHECK ("kind" IN ('cost_correction','late_landed_cost'));
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_phase5_check";
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_phase6_check" CHECK ("type" IN ('receive','reserve','release','issue_to_custody','custody_to_sold','return_in','return_to_supplier','transfer','adjust','write_down'));

ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_default_location_id_fkey" FOREIGN KEY ("default_location_id") REFERENCES "warehouse_locations"("id");
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id");
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "warehouse_locations"("id");
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_batches"("id");
ALTER TABLE "purchase_landed_costs" ADD CONSTRAINT "purchase_landed_costs_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE;
ALTER TABLE "supplier_opening_balances" ADD CONSTRAINT "supplier_opening_balances_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id");
ALTER TABLE "supplier_opening_balances" ADD CONSTRAINT "supplier_opening_balances_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");
ALTER TABLE "supplier_opening_balances" ADD CONSTRAINT "supplier_opening_balances_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id");
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id");
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_purchase_invoice_id_fkey" FOREIGN KEY ("purchase_invoice_id") REFERENCES "purchase_invoices"("id");
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_opening_balance_id_fkey" FOREIGN KEY ("opening_balance_id") REFERENCES "supplier_opening_balances"("id");
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "supplier_payments"("id");
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_credit_id_fkey" FOREIGN KEY ("credit_id") REFERENCES "supplier_credits"("id");
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "supplier_returns"("id");
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id");
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id");
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id");
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "supplier_payments"("id") ON DELETE CASCADE;
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "purchase_invoices"("id");
ALTER TABLE "supplier_credits" ADD CONSTRAINT "supplier_credits_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id");
ALTER TABLE "supplier_credits" ADD CONSTRAINT "supplier_credits_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "supplier_payments"("id");
ALTER TABLE "supplier_credits" ADD CONSTRAINT "supplier_credits_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "supplier_returns"("id");
ALTER TABLE "supplier_credit_allocations" ADD CONSTRAINT "supplier_credit_allocations_credit_id_fkey" FOREIGN KEY ("credit_id") REFERENCES "supplier_credits"("id") ON DELETE CASCADE;
ALTER TABLE "supplier_credit_allocations" ADD CONSTRAINT "supplier_credit_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "purchase_invoices"("id");
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id");
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "purchase_invoices"("id");
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id");
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "supplier_returns"("id") ON DELETE CASCADE;
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_invoice_items"("id");
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id");
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "warehouse_locations"("id");
ALTER TABLE "purchase_cost_corrections" ADD CONSTRAINT "purchase_cost_corrections_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "purchase_invoices"("id");
ALTER TABLE "purchase_cost_corrections" ADD CONSTRAINT "purchase_cost_corrections_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id");
ALTER TABLE "purchase_cost_corrections" ADD CONSTRAINT "purchase_cost_corrections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");
ALTER TABLE "purchase_cost_corrections" ADD CONSTRAINT "purchase_cost_corrections_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id");
ALTER TABLE "purchase_cost_correction_lines" ADD CONSTRAINT "purchase_cost_correction_lines_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "purchase_cost_corrections"("id") ON DELETE CASCADE;
ALTER TABLE "purchase_cost_correction_lines" ADD CONSTRAINT "purchase_cost_correction_lines_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_invoice_items"("id");
