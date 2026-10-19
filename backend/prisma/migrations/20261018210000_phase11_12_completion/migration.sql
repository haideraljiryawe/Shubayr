-- C15 completes the remaining phase 11 owner/prepaid scope and adds the
-- covering indexes/permissions used by the remaining phase 12 reports.

INSERT INTO "store_settings" ("key", "value")
VALUES ('return_window_days', '14')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "ledger_accounts" ("code", "name_ar", "name_en", "type", "normal_side")
VALUES ('1060', 'مصاريف مدفوعة مقدماً', 'Prepaid expenses', 'asset', 'debit')
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "expenses"
  ADD COLUMN "recognition_mode" VARCHAR(16) NOT NULL DEFAULT 'immediate',
  ADD CONSTRAINT "expenses_recognition_mode_check"
    CHECK ("recognition_mode" IN ('immediate', 'prepaid'));

CREATE TABLE "expense_schedules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "expense_id" UUID NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'active',
  "start_date" DATE NOT NULL,
  "periods" INTEGER NOT NULL,
  "amount_iqd" DECIMAL(30,12) NOT NULL,
  "recognized_iqd" DECIMAL(30,12) NOT NULL DEFAULT 0,
  "cancelled_iqd" DECIMAL(30,12) NOT NULL DEFAULT 0,
  "created_by" UUID NOT NULL,
  "cancelled_by" UUID,
  "cancelled_at" TIMESTAMPTZ(6),
  "cancel_reason" VARCHAR(500),
  "cancellation_journal_entry_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expense_schedules_expense_id_key" UNIQUE ("expense_id"),
  CONSTRAINT "expense_schedules_cancellation_journal_key" UNIQUE ("cancellation_journal_entry_id"),
  CONSTRAINT "expense_schedules_status_check" CHECK ("status" IN ('active','blocked','completed','cancelled','reversed')),
  CONSTRAINT "expense_schedules_periods_check" CHECK ("periods" BETWEEN 2 AND 120),
  CONSTRAINT "expense_schedules_amounts_check" CHECK (
    "amount_iqd" > 0 AND "recognized_iqd" >= 0 AND "cancelled_iqd" >= 0
    AND "recognized_iqd" + "cancelled_iqd" <= "amount_iqd"
  ),
  CONSTRAINT "expense_schedules_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "expense_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "expense_schedules_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "expense_schedules_cancellation_journal_fkey" FOREIGN KEY ("cancellation_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE "expense_schedule_installments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "schedule_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "scheduled_date" DATE NOT NULL,
  "amount_iqd" DECIMAL(30,12) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
  "journal_entry_id" UUID,
  "posted_at" TIMESTAMPTZ(6),
  "last_error" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_schedule_installments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expense_schedule_installments_schedule_sequence_key" UNIQUE ("schedule_id", "sequence"),
  CONSTRAINT "expense_schedule_installments_journal_key" UNIQUE ("journal_entry_id"),
  CONSTRAINT "expense_schedule_installments_status_check" CHECK ("status" IN ('pending','posted','cancelled')),
  CONSTRAINT "expense_schedule_installments_amount_check" CHECK ("amount_iqd" > 0),
  CONSTRAINT "expense_schedule_installments_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "expense_schedules"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "expense_schedule_installments_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "idx_expense_schedule_due"
  ON "expense_schedule_installments" ("status", "scheduled_date", "schedule_id", "sequence");

CREATE TABLE "owner_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_number" VARCHAR(40) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
  "kind" VARCHAR(16) NOT NULL,
  "cash_account_id" UUID NOT NULL,
  "currency_code" CHAR(3) NOT NULL,
  "amount_currency" DECIMAL(20,6) NOT NULL,
  "exchange_rate" DECIMAL(24,10) NOT NULL,
  "amount_iqd" DECIMAL(30,12) NOT NULL,
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "backdate_reason" VARCHAR(500),
  "reason" VARCHAR(500) NOT NULL,
  "reference_number" VARCHAR(160),
  "created_by" UUID NOT NULL,
  "posted_by" UUID,
  "posted_at" TIMESTAMPTZ(6),
  "journal_entry_id" UUID,
  "reversed_by" UUID,
  "reversed_at" TIMESTAMPTZ(6),
  "reversal_reason" VARCHAR(500),
  "reversal_journal_entry_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "owner_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "owner_transactions_document_number_key" UNIQUE ("document_number"),
  CONSTRAINT "owner_transactions_journal_key" UNIQUE ("journal_entry_id"),
  CONSTRAINT "owner_transactions_reversal_journal_key" UNIQUE ("reversal_journal_entry_id"),
  CONSTRAINT "owner_transactions_status_check" CHECK ("status" IN ('draft','posted','reversed')),
  CONSTRAINT "owner_transactions_kind_check" CHECK ("kind" IN ('capital_deposit','drawing')),
  CONSTRAINT "owner_transactions_amount_check" CHECK ("amount_currency" > 0 AND "exchange_rate" > 0 AND "amount_iqd" > 0),
  CONSTRAINT "owner_transactions_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "owner_transactions_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "owner_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "owner_transactions_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "owner_transactions_reversed_by_fkey" FOREIGN KEY ("reversed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "owner_transactions_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "owner_transactions_reversal_journal_entry_id_fkey" FOREIGN KEY ("reversal_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "idx_owner_transactions_date"
  ON "owner_transactions" ("accounting_date" DESC, "id" DESC);
CREATE INDEX "idx_owner_transactions_kind_status_date"
  ON "owner_transactions" ("kind", "status", "accounting_date" DESC);

CREATE OR REPLACE FUNCTION "protect_owner_transactions"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'draft' THEN
      RAISE EXCEPTION 'posted owner transactions are immutable' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" <> 'draft' AND ROW(
    NEW."id", NEW."document_number", NEW."kind", NEW."cash_account_id",
    NEW."currency_code", NEW."amount_currency", NEW."exchange_rate",
    NEW."amount_iqd", NEW."document_date", NEW."accounting_date",
    NEW."backdate_reason", NEW."reason", NEW."reference_number",
    NEW."created_by", NEW."created_at"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."document_number", OLD."kind", OLD."cash_account_id",
    OLD."currency_code", OLD."amount_currency", OLD."exchange_rate",
    OLD."amount_iqd", OLD."document_date", OLD."accounting_date",
    OLD."backdate_reason", OLD."reason", OLD."reference_number",
    OLD."created_by", OLD."created_at"
  ) THEN
    RAISE EXCEPTION 'posted owner transaction fields are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_protect_owner_transactions"
BEFORE UPDATE OR DELETE ON "owner_transactions"
FOR EACH ROW EXECUTE FUNCTION "protect_owner_transactions"();

-- Include the newly shipped recognition mode in the posted-expense database
-- immutability guard.
CREATE OR REPLACE FUNCTION "protect_expense_documents"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'draft' THEN
      RAISE EXCEPTION 'posted expense documents are immutable' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" = 'reversed' THEN
    RAISE EXCEPTION 'reversed expense documents are immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD."status" = 'draft' AND NEW."status" NOT IN ('draft','posted') THEN
    RAISE EXCEPTION 'draft expenses may only remain draft or transition to posted' USING ERRCODE = '55000';
  END IF;
  IF OLD."status" = 'posted' AND NEW."status" NOT IN ('posted','reversed') THEN
    RAISE EXCEPTION 'posted expenses may only transition to reversed' USING ERRCODE = '55000';
  END IF;
  IF ROW(
    NEW."id", NEW."document_number", NEW."category_id", NEW."amount_currency",
    NEW."currency_code", NEW."exchange_rate", NEW."amount_iqd", NEW."payment_mode",
    NEW."recognition_mode", NEW."cash_account_id", NEW."supplier_id", NEW."payee",
    NEW."description", NEW."reference_number", NEW."receipt_media_id",
    NEW."document_date", NEW."accounting_date", NEW."backdate_reason",
    NEW."created_by", NEW."posted_by", NEW."posted_at", NEW."journal_entry_id",
    NEW."created_at"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."document_number", OLD."category_id", OLD."amount_currency",
    OLD."currency_code", OLD."exchange_rate", OLD."amount_iqd", OLD."payment_mode",
    OLD."recognition_mode", OLD."cash_account_id", OLD."supplier_id", OLD."payee",
    OLD."description", OLD."reference_number", OLD."receipt_media_id",
    OLD."document_date", OLD."accounting_date", OLD."backdate_reason",
    OLD."created_by", OLD."posted_by", OLD."posted_at", OLD."journal_entry_id",
    OLD."created_at"
  ) AND OLD."status" <> 'draft' THEN
    RAISE EXCEPTION 'posted expense document fields are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE "report_exports" DROP CONSTRAINT "report_exports_type_check";
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_type_check" CHECK (
  "report_type" IN (
    'sales','profitability','profit_loss','trial_balance','balance_sheet',
    'cash','delivery_custody','liabilities','inventory_valuation',
    'purchases','supplier_statement','stock_movement','expenses'
  )
);

CREATE INDEX "idx_purchase_items_report_dimensions"
  ON "purchase_invoice_items" ("invoice_id", "variant_id", "product_id");
CREATE INDEX "idx_supplier_return_lines_report_dimensions"
  ON "supplier_return_lines" ("return_id", "purchase_item_id");
CREATE INDEX "idx_stock_movements_report_dimensions"
  ON "stock_movements" ("created_at", "batch_id", "from_location", "to_location", "type");
CREATE INDEX "idx_expense_schedules_report"
  ON "expense_schedules" ("expense_id", "status");

INSERT INTO "permissions" ("key", "group", "description") VALUES
  ('owner_transactions.read', 'accounting', 'View owner capital and drawing documents'),
  ('owner_transactions.create', 'accounting', 'Create owner capital and drawing drafts'),
  ('owner_transactions.post', 'accounting', 'Post owner capital and drawing documents'),
  ('owner_transactions.reverse', 'accounting', 'Reverse owner capital and drawing documents'),
  ('reports.purchases.read', 'reports', 'View purchase cost reports'),
  ('reports.suppliers.read', 'reports', 'View supplier statements'),
  ('reports.stock.read', 'reports', 'View stock movement and value reports'),
  ('reports.expenses.read', 'reports', 'View recognised expense reports')
ON CONFLICT ("key") DO UPDATE SET "group" = EXCLUDED."group", "description" = EXCLUDED."description";

INSERT INTO "preset_permissions" ("preset_id", "permission_id")
SELECT preset."id", permission."id"
FROM "permission_presets" preset
CROSS JOIN "permissions" permission
WHERE preset."name" = 'super_admin'
   OR (preset."name" = 'accountant' AND permission."key" IN (
     'owner_transactions.read','owner_transactions.create',
     'reports.purchases.read','reports.suppliers.read','reports.stock.read','reports.expenses.read'
   ))
ON CONFLICT ("preset_id", "permission_id") DO NOTHING;
