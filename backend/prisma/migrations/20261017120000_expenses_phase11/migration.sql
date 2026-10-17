-- Phase 11 expenses: category reference data, immutable expense documents,
-- partial payments, and reversal-only corrections.

INSERT INTO "ledger_accounts" ("code", "name_ar", "name_en", "type", "normal_side") VALUES
  ('5100', 'إيجار', 'Rent expense', 'expense', 'debit'),
  ('5110', 'رواتب مدفوعة نقداً', 'Cash salaries expense', 'expense', 'debit'),
  ('5120', 'كهرباء', 'Electricity expense', 'expense', 'debit'),
  ('5130', 'وقود المولد', 'Generator fuel expense', 'expense', 'debit'),
  ('5140', 'إنترنت', 'Internet expense', 'expense', 'debit'),
  ('5150', 'تسويق', 'Marketing expense', 'expense', 'debit'),
  ('5160', 'تغليف', 'Packaging expense', 'expense', 'debit'),
  ('5170', 'نقل', 'Transport expense', 'expense', 'debit'),
  ('5180', 'صيانة', 'Maintenance expense', 'expense', 'debit'),
  ('5190', 'رسوم حكومية', 'Government fees expense', 'expense', 'debit'),
  ('5200', 'مصاريف أخرى', 'Other expense', 'expense', 'debit')
ON CONFLICT ("code") DO UPDATE SET
  "name_ar" = EXCLUDED."name_ar",
  "name_en" = EXCLUDED."name_en";

CREATE TABLE "expense_categories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(40) NOT NULL,
  "name_ar" VARCHAR(160) NOT NULL,
  "name_en" VARCHAR(160) NOT NULL,
  "ledger_account_id" UUID NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "is_system" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expense_categories_code_key" UNIQUE ("code"),
  CONSTRAINT "expense_categories_ledger_account_id_fkey" FOREIGN KEY ("ledger_account_id") REFERENCES "ledger_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "idx_expense_categories_active_name" ON "expense_categories"("is_active", "name_en", "id");

INSERT INTO "expense_categories" ("code", "name_ar", "name_en", "ledger_account_id", "is_system")
SELECT values."code", values."name_ar", values."name_en", account."id", TRUE
FROM (VALUES
  ('rent', 'الإيجار', 'Rent', '5100'),
  ('cash_salaries', 'الرواتب المدفوعة نقداً', 'Salaries paid in cash', '5110'),
  ('electricity', 'الكهرباء', 'Electricity', '5120'),
  ('generator_fuel', 'وقود المولد', 'Generator fuel', '5130'),
  ('internet', 'الإنترنت', 'Internet', '5140'),
  ('marketing', 'التسويق', 'Marketing', '5150'),
  ('packaging', 'التغليف', 'Packaging', '5160'),
  ('transport', 'النقل', 'Transport', '5170'),
  ('maintenance', 'الصيانة', 'Maintenance', '5180'),
  ('government_fees', 'الرسوم الحكومية', 'Government fees', '5190'),
  ('other', 'أخرى', 'Other', '5200')
) AS values("code", "name_ar", "name_en", "account_code")
JOIN "ledger_accounts" account ON account."code" = values."account_code";

CREATE TABLE "expenses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_number" VARCHAR(40) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
  "category_id" UUID NOT NULL,
  "amount_currency" DECIMAL(20,6) NOT NULL,
  "currency_code" CHAR(3) NOT NULL,
  "exchange_rate" DECIMAL(24,10),
  "amount_iqd" DECIMAL(30,12),
  "paid_currency" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "balance_currency" DECIMAL(20,6) NOT NULL,
  "payment_mode" VARCHAR(16) NOT NULL,
  "cash_account_id" UUID,
  "supplier_id" UUID,
  "payee" VARCHAR(200),
  "description" VARCHAR(2000) NOT NULL,
  "reference_number" VARCHAR(160),
  "receipt_media_id" UUID,
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "backdate_reason" VARCHAR(500),
  "created_by" UUID NOT NULL,
  "posted_by" UUID,
  "posted_at" TIMESTAMPTZ(6),
  "journal_entry_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expenses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expenses_document_number_key" UNIQUE ("document_number"),
  CONSTRAINT "expenses_journal_entry_id_key" UNIQUE ("journal_entry_id"),
  CONSTRAINT "expenses_status_check" CHECK ("status" IN ('draft','posted','reversed')),
  CONSTRAINT "expenses_payment_mode_check" CHECK ("payment_mode" IN ('paid_now','owed')),
  CONSTRAINT "expenses_amount_check" CHECK ("amount_currency" > 0 AND "paid_currency" >= 0 AND "balance_currency" >= 0 AND ("status" = 'reversed' OR "paid_currency" + "balance_currency" = "amount_currency") AND ("amount_iqd" IS NULL OR "amount_iqd" > 0) AND ("exchange_rate" IS NULL OR "exchange_rate" > 0)),
  CONSTRAINT "expenses_payee_check" CHECK ("supplier_id" IS NOT NULL OR length(btrim(coalesce("payee", ''))) > 0),
  CONSTRAINT "expenses_cash_mode_check" CHECK (("payment_mode" = 'paid_now' AND "cash_account_id" IS NOT NULL) OR ("payment_mode" = 'owed' AND "cash_account_id" IS NULL)),
  CONSTRAINT "expenses_posted_fields_check" CHECK (("status" = 'draft' AND "posted_by" IS NULL AND "posted_at" IS NULL AND "journal_entry_id" IS NULL) OR ("status" IN ('posted','reversed') AND "posted_by" IS NOT NULL AND "posted_at" IS NOT NULL AND "journal_entry_id" IS NOT NULL AND "exchange_rate" IS NOT NULL AND "amount_iqd" IS NOT NULL)),
  CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "expenses_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "expenses_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "expenses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "expenses_receipt_media_id_fkey" FOREIGN KEY ("receipt_media_id") REFERENCES "media_objects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "expenses_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "expenses_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "idx_expenses_document_date" ON "expenses"("document_date" DESC, "id" DESC);
CREATE INDEX "idx_expenses_category_date" ON "expenses"("category_id", "document_date" DESC);
CREATE INDEX "idx_expenses_status_date" ON "expenses"("status", "document_date" DESC);
CREATE INDEX "idx_expenses_cash_date" ON "expenses"("cash_account_id", "document_date" DESC);
CREATE INDEX "idx_expenses_supplier" ON "expenses"("supplier_id");

CREATE TABLE "expense_payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_number" VARCHAR(40) NOT NULL,
  "expense_id" UUID NOT NULL,
  "cash_account_id" UUID NOT NULL,
  "currency_code" CHAR(3) NOT NULL,
  "amount_currency" DECIMAL(20,6) NOT NULL,
  "exchange_rate" DECIMAL(24,10) NOT NULL,
  "amount_iqd" DECIMAL(30,12) NOT NULL,
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "backdate_reason" VARCHAR(500),
  "reference_number" VARCHAR(160),
  "notes" VARCHAR(1000),
  "created_by" UUID NOT NULL,
  "journal_entry_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expense_payments_document_number_key" UNIQUE ("document_number"),
  CONSTRAINT "expense_payments_journal_entry_id_key" UNIQUE ("journal_entry_id"),
  CONSTRAINT "expense_payments_amount_check" CHECK ("amount_currency" > 0 AND "amount_iqd" > 0 AND "exchange_rate" > 0),
  CONSTRAINT "expense_payments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "expense_payments_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "expense_payments_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "expense_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "expense_payments_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "idx_expense_payments_expense" ON "expense_payments"("expense_id", "created_at", "id");

CREATE TABLE "expense_corrections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_number" VARCHAR(40) NOT NULL,
  "expense_id" UUID NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "backdate_reason" VARCHAR(500),
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_corrections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expense_corrections_document_number_key" UNIQUE ("document_number"),
  CONSTRAINT "expense_corrections_expense_id_key" UNIQUE ("expense_id"),
  CONSTRAINT "expense_corrections_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "expense_corrections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE "expense_correction_postings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "correction_id" UUID NOT NULL,
  "expense_payment_id" UUID,
  "role" VARCHAR(40) NOT NULL,
  "original_journal_entry_id" UUID NOT NULL,
  "reversal_journal_entry_id" UUID NOT NULL,
  CONSTRAINT "expense_correction_postings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expense_correction_postings_original_key" UNIQUE ("original_journal_entry_id"),
  CONSTRAINT "expense_correction_postings_reversal_key" UNIQUE ("reversal_journal_entry_id"),
  CONSTRAINT "expense_correction_postings_role_key" UNIQUE ("correction_id", "role"),
  CONSTRAINT "expense_correction_postings_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "expense_corrections"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "expense_correction_postings_expense_payment_id_fkey" FOREIGN KEY ("expense_payment_id") REFERENCES "expense_payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "expense_correction_postings_original_journal_fkey" FOREIGN KEY ("original_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "expense_correction_postings_reversal_journal_fkey" FOREIGN KEY ("reversal_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE FUNCTION "protect_expense_documents"() RETURNS trigger AS $$
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
  IF OLD."status" = 'draft' AND NEW."status" <> 'posted' THEN
    RAISE EXCEPTION 'draft expenses may only transition to posted' USING ERRCODE = '55000';
  END IF;
  IF OLD."status" = 'posted' AND NEW."status" NOT IN ('posted','reversed') THEN
    RAISE EXCEPTION 'posted expenses may only transition to reversed' USING ERRCODE = '55000';
  END IF;
  IF ROW(
    NEW."id", NEW."document_number", NEW."category_id", NEW."amount_currency",
    NEW."currency_code", NEW."exchange_rate", NEW."amount_iqd", NEW."payment_mode",
    NEW."cash_account_id", NEW."supplier_id", NEW."payee", NEW."description",
    NEW."reference_number", NEW."receipt_media_id", NEW."document_date",
    NEW."accounting_date", NEW."backdate_reason", NEW."created_by", NEW."posted_by",
    NEW."posted_at", NEW."journal_entry_id", NEW."created_at"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."document_number", OLD."category_id", OLD."amount_currency",
    OLD."currency_code", OLD."exchange_rate", OLD."amount_iqd", OLD."payment_mode",
    OLD."cash_account_id", OLD."supplier_id", OLD."payee", OLD."description",
    OLD."reference_number", OLD."receipt_media_id", OLD."document_date",
    OLD."accounting_date", OLD."backdate_reason", OLD."created_by", OLD."posted_by",
    OLD."posted_at", OLD."journal_entry_id", OLD."created_at"
  ) AND OLD."status" <> 'draft' THEN
    RAISE EXCEPTION 'posted expense document fields are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_protect_expense_documents"
BEFORE UPDATE OR DELETE ON "expenses"
FOR EACH ROW EXECUTE FUNCTION "protect_expense_documents"();

CREATE FUNCTION "protect_expense_child_documents"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'posted expense child documents are immutable' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_protect_expense_payments"
BEFORE UPDATE OR DELETE ON "expense_payments"
FOR EACH ROW EXECUTE FUNCTION "protect_expense_child_documents"();
CREATE TRIGGER "trg_protect_expense_corrections"
BEFORE UPDATE OR DELETE ON "expense_corrections"
FOR EACH ROW EXECUTE FUNCTION "protect_expense_child_documents"();
CREATE TRIGGER "trg_protect_expense_correction_postings"
BEFORE UPDATE OR DELETE ON "expense_correction_postings"
FOR EACH ROW EXECUTE FUNCTION "protect_expense_child_documents"();

INSERT INTO "permissions" ("key", "group", "description") VALUES
  ('expenses.read', 'expenses', 'View expense documents and categories'),
  ('expenses.create', 'expenses', 'Create draft expense documents'),
  ('expenses.post', 'expenses', 'Post draft expense documents'),
  ('expenses.pay', 'expenses', 'Pay accrued expense documents'),
  ('expenses.reverse', 'expenses', 'Reverse posted expense documents'),
  ('expense_categories.manage', 'expenses', 'Manage expense categories')
ON CONFLICT ("key") DO UPDATE SET "group" = EXCLUDED."group", "description" = EXCLUDED."description";

INSERT INTO "preset_permissions" ("preset_id", "permission_id")
SELECT preset."id", permission."id"
FROM "permission_presets" preset
CROSS JOIN "permissions" permission
WHERE preset."name" = 'super_admin'
   OR (preset."name" = 'accountant' AND permission."key" IN ('expenses.read','expenses.create'))
ON CONFLICT ("preset_id", "permission_id") DO NOTHING;
