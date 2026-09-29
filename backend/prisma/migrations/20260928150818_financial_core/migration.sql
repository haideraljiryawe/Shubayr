-- AlterTable
ALTER TABLE "cart_items" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "coupons" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "value" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "delivery_fee" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "inventory_batches" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "purchase_cost" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(20,6),
ALTER COLUMN "line_total" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "accounting_date" DATE NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ADD COLUMN     "document_date" DATE NOT NULL DEFAULT CURRENT_DATE,
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(20,6),
ALTER COLUMN "delivery_fee" SET DATA TYPE DECIMAL(20,6),
ALTER COLUMN "discount" SET DATA TYPE DECIMAL(20,6),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "accounting_date" DATE NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ADD COLUMN     "document_date" DATE NOT NULL DEFAULT CURRENT_DATE,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "price_delta" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "price" SET DATA TYPE DECIMAL(20,6),
ALTER COLUMN "discount_value" SET DATA TYPE DECIMAL(20,6),
ALTER COLUMN "floor_price" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "purchase_invoice_items" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "unit_cost" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "purchase_invoices" ADD COLUMN     "accounting_date" DATE NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ADD COLUMN     "document_date" DATE NOT NULL DEFAULT CURRENT_DATE,
ALTER COLUMN "total_cost" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "refund_ledger" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "return_items" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "returns" ADD COLUMN     "accounting_date" DATE NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ADD COLUMN     "document_date" DATE NOT NULL DEFAULT CURRENT_DATE,
ALTER COLUMN "expected_refund" SET DATA TYPE DECIMAL(20,6),
ALTER COLUMN "refund_amount" SET DATA TYPE DECIMAL(20,6);

-- Existing commerce rows become IQD rows. Normalize customer-facing values to
-- IQD's zero-decimal display precision while preserving higher-precision costs.
UPDATE "products" SET
  "price" = round("price"),
  "floor_price" = CASE WHEN "floor_price" IS NULL THEN NULL ELSE round("floor_price") END,
  "discount_value" = CASE
    WHEN "discount_type" = 'amount' AND "discount_value" IS NOT NULL THEN round("discount_value")
    ELSE "discount_value"
  END;
UPDATE "product_variants" SET "price_delta" = round("price_delta");
UPDATE "cart_items" SET "unit_price" = round("unit_price");
UPDATE "coupons" SET "value" = round("value") WHERE "type" = 'fixed';
UPDATE "orders" SET
  "subtotal" = round("subtotal"), "delivery_fee" = round("delivery_fee"),
  "discount" = round("discount"), "total" = round("total");
UPDATE "order_items" SET "unit_price" = round("unit_price"), "line_total" = round("line_total");
UPDATE "payments" SET "amount" = round("amount");
UPDATE "deliveries" SET "delivery_fee" = round("delivery_fee");
UPDATE "returns" SET "expected_refund" = round("expected_refund"), "refund_amount" = round("refund_amount");
UPDATE "return_items" SET "unit_price" = round("unit_price");
UPDATE "refund_ledger" SET "amount" = round("amount");

-- CreateTable
CREATE TABLE "currencies" (
    "code" CHAR(3) NOT NULL,
    "name_ar" VARCHAR(120) NOT NULL,
    "name_en" VARCHAR(120) NOT NULL,
    "symbol" VARCHAR(20) NOT NULL,
    "display_precision" INTEGER NOT NULL,
    "is_base" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "currency_code" CHAR(3) NOT NULL,
    "rate" DECIMAL(24,10) NOT NULL,
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "set_by" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "document_type" VARCHAR(40) NOT NULL,
    "year" INTEGER NOT NULL,
    "prefix" VARCHAR(12) NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("document_type","year")
);

-- CreateTable
CREATE TABLE "operation_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "operation_id" VARCHAR(128) NOT NULL,
    "endpoint" VARCHAR(160) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'processing',
    "response_status" INTEGER,
    "response" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "operation_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "document_type" VARCHAR(60) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(40) NOT NULL,
    "name_ar" VARCHAR(160) NOT NULL,
    "name_en" VARCHAR(160) NOT NULL,
    "type" VARCHAR(24) NOT NULL,
    "normal_side" VARCHAR(6) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_number" VARCHAR(40) NOT NULL,
    "source_type" VARCHAR(60) NOT NULL,
    "source_id" UUID NOT NULL,
    "event" VARCHAR(60) NOT NULL,
    "document_date" DATE NOT NULL,
    "accounting_date" DATE NOT NULL,
    "description" VARCHAR(500),
    "created_by" UUID NOT NULL,
    "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reverses_id" UUID,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "debit_base" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "credit_base" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "currency_code" CHAR(3) NOT NULL,
    "original_amount" DECIMAL(20,6) NOT NULL,
    "exchange_rate" DECIMAL(24,10) NOT NULL,
    "memo" VARCHAR(500),

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(160) NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "ledger_account_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_opening_balances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_number" VARCHAR(40) NOT NULL,
    "cash_account_id" UUID NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "document_date" DATE NOT NULL,
    "accounting_date" DATE NOT NULL,
    "backdate_reason" VARCHAR(500),
    "created_by" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_opening_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_number" VARCHAR(40) NOT NULL,
    "from_account_id" UUID NOT NULL,
    "to_account_id" UUID NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "document_date" DATE NOT NULL,
    "accounting_date" DATE NOT NULL,
    "backdate_reason" VARCHAR(500),
    "reason" VARCHAR(500) NOT NULL,
    "created_by" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_periods" (
    "month" DATE NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'open',
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "reopened_at" TIMESTAMPTZ(6),
    "reopened_by" UUID,
    "reopen_reason" VARCHAR(500),

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("month")
);

-- CreateTable
CREATE TABLE "period_closes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "period_month" DATE NOT NULL,
    "sequence" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "differences" JSONB,
    "reason" VARCHAR(500),
    "closed_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "period_closes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_hours" (
    "weekday" INTEGER NOT NULL,
    "opens_at" CHAR(5),
    "closes_at" CHAR(5),
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_hours_pkey" PRIMARY KEY ("weekday")
);

-- CreateTable
CREATE TABLE "closed_days" (
    "date" DATE NOT NULL,
    "reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "closed_days_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "protection_thresholds" (
    "key" VARCHAR(40) NOT NULL,
    "percent" DECIMAL(7,2) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protection_thresholds_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "idx_exchange_rates_applicable" ON "exchange_rates"("currency_code", "effective_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "operation_records_user_id_operation_id_key" ON "operation_records"("user_id", "operation_id");

-- CreateIndex
CREATE INDEX "idx_document_drafts_user" ON "document_drafts"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "document_drafts_user_id_document_type_key" ON "document_drafts"("user_id", "document_type");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_code_key" ON "ledger_accounts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_document_number_key" ON "journal_entries"("document_number");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reverses_id_key" ON "journal_entries"("reverses_id");

-- CreateIndex
CREATE INDEX "idx_journal_entries_accounting_date" ON "journal_entries"("accounting_date", "id");

-- CreateIndex
CREATE INDEX "idx_journal_entries_source" ON "journal_entries"("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_source_event_key" ON "journal_entries"("source_type", "source_id", "event");

-- CreateIndex
CREATE INDEX "idx_journal_lines_account" ON "journal_lines"("account_id", "entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_accounts_ledger_account_id_key" ON "cash_accounts"("ledger_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_opening_balances_document_number_key" ON "cash_opening_balances"("document_number");

-- CreateIndex
CREATE UNIQUE INDEX "cash_opening_balances_journal_entry_id_key" ON "cash_opening_balances"("journal_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_transfers_document_number_key" ON "cash_transfers"("document_number");

-- CreateIndex
CREATE UNIQUE INDEX "cash_transfers_journal_entry_id_key" ON "cash_transfers"("journal_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "period_closes_period_sequence_key" ON "period_closes"("period_month", "sequence");

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reverses_id_fkey" FOREIGN KEY ("reverses_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_ledger_account_id_fkey" FOREIGN KEY ("ledger_account_id") REFERENCES "ledger_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_opening_balances" ADD CONSTRAINT "cash_opening_balances_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_opening_balances" ADD CONSTRAINT "cash_opening_balances_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "cash_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "cash_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "period_closes" ADD CONSTRAINT "period_closes_period_month_fkey" FOREIGN KEY ("period_month") REFERENCES "accounting_periods"("month") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Exact financial-domain invariants that Prisma cannot express.
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_code_iso_check" CHECK ("code" ~ '^[A-Z]{3}$');
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_precision_check" CHECK ("display_precision" BETWEEN 0 AND 6);
CREATE UNIQUE INDEX "currencies_one_base_key" ON "currencies" ((TRUE)) WHERE "is_base";
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_positive_check" CHECK ("rate" > 0);
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_one_side_check" CHECK (
  ("debit_base" > 0 AND "credit_base" = 0) OR
  ("credit_base" > 0 AND "debit_base" = 0)
);
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_original_positive_check" CHECK ("original_amount" > 0 AND "exchange_rate" > 0);
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_type_check" CHECK ("type" IN ('asset','liability','equity','income','contra_revenue','expense'));
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_normal_side_check" CHECK ("normal_side" IN ('debit','credit'));
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_kind_check" CHECK ("kind" IN ('cash','bank'));
ALTER TABLE "cash_opening_balances" ADD CONSTRAINT "cash_opening_balances_positive_check" CHECK ("amount" > 0);
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_positive_check" CHECK ("amount" > 0);
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_distinct_accounts_check" CHECK ("from_account_id" <> "to_account_id");
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_status_check" CHECK ("status" IN ('open','closed'));
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6);
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_pair_check" CHECK (
  ("is_closed" AND "opens_at" IS NULL AND "closes_at" IS NULL) OR
  (NOT "is_closed" AND "opens_at" ~ '^[0-2][0-9]:[0-5][0-9]$' AND "closes_at" ~ '^[0-2][0-9]:[0-5][0-9]$')
);
ALTER TABLE "protection_thresholds" ADD CONSTRAINT "protection_thresholds_percent_check" CHECK ("percent" >= 0);

CREATE FUNCTION "assert_journal_balanced"() RETURNS trigger AS $$
DECLARE
  affected_entry UUID;
  debit_total NUMERIC(20,4);
  credit_total NUMERIC(20,4);
  line_count INTEGER;
BEGIN
  affected_entry := COALESCE(NEW.entry_id, OLD.entry_id);
  SELECT COALESCE(SUM(debit_base), 0), COALESCE(SUM(credit_base), 0), COUNT(*)
    INTO debit_total, credit_total, line_count
    FROM journal_lines WHERE entry_id = affected_entry;
  IF line_count < 2 OR debit_total <> credit_total THEN
    RAISE EXCEPTION 'journal entry % is not balanced', affected_entry USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "journal_lines_balance_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "journal_lines"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_journal_balanced"();

CREATE FUNCTION "protect_posted_journal"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'posted journal records are immutable' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "journal_entries_immutable_trigger"
BEFORE UPDATE OR DELETE ON "journal_entries"
FOR EACH ROW EXECUTE FUNCTION "protect_posted_journal"();

CREATE TRIGGER "journal_lines_immutable_trigger"
BEFORE UPDATE OR DELETE ON "journal_lines"
FOR EACH ROW EXECUTE FUNCTION "protect_posted_journal"();

CREATE FUNCTION "reject_closed_period_posting"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM accounting_periods
    WHERE month = date_trunc('month', NEW.accounting_date)::date
      AND status = 'closed'
  ) THEN
    RAISE EXCEPTION 'accounting period is closed' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "journal_entries_open_period_trigger"
BEFORE INSERT ON "journal_entries"
FOR EACH ROW EXECUTE FUNCTION "reject_closed_period_posting"();

CREATE FUNCTION "lock_base_currency_after_movement"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM journal_entries LIMIT 1) AND
     (TG_OP = 'DELETE' OR OLD.is_base IS DISTINCT FROM NEW.is_base OR OLD.code IS DISTINCT FROM NEW.code) THEN
    RAISE EXCEPTION 'base currency is locked after the first financial movement' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "currencies_base_lock_trigger"
BEFORE UPDATE OR DELETE ON "currencies"
FOR EACH ROW WHEN (OLD.is_base)
EXECUTE FUNCTION "lock_base_currency_after_movement"();

-- Initial currency registry, settings and chart of accounts.
INSERT INTO "currencies" ("code","name_ar","name_en","symbol","display_precision","is_base","enabled") VALUES
  ('IQD','دينار عراقي','Iraqi Dinar','د.ع',0,TRUE,TRUE),
  ('USD','دولار أمريكي','US Dollar','US$',2,FALSE,TRUE);

INSERT INTO "ledger_accounts" ("code","name_ar","name_en","type","normal_side") VALUES
  ('1000','المخزون','Inventory','asset','debit'),
  ('1010','بضاعة في عهدة التوصيل','Goods in delivery custody','asset','debit'),
  ('1020','نقد في عهدة التوصيل','Cash in delivery custody','asset','debit'),
  ('1030','تحصيل بانتظار التأكيد','Collection awaiting confirmation','asset','debit'),
  ('1040','استثناءات التحصيل','Collection exceptions under review','asset','debit'),
  ('1050','النقد والبنوك','Cash and bank accounts','asset','debit'),
  ('2000','ذمم الموردين','Supplier payable','liability','credit'),
  ('2010','ذمم الشحن','Freight payable','liability','credit'),
  ('2020','ذمم الأجور والنقل','Wages and fares payable','liability','credit'),
  ('2030','مبالغ مستردة مستحقة','Refunds payable','liability','credit'),
  ('2040','مصاريف مستحقة','Expense payable','liability','credit'),
  ('3000','حقوق المالك','Owner equity','equity','credit'),
  ('3010','مسحوبات المالك','Owner drawings','equity','debit'),
  ('4000','إيراد المبيعات','Sales revenue','income','credit'),
  ('4010','إيراد أجور التوصيل','Delivery-fee revenue','income','credit'),
  ('4020','أرباح فروق الصرف','FX gain','income','credit'),
  ('4100','مردودات المبيعات','Sales returns','contra_revenue','debit'),
  ('4110','مردود أجور التوصيل','Delivery-fee refunds','contra_revenue','debit'),
  ('5000','كلفة البضاعة المباعة','Cost of goods sold','expense','debit'),
  ('5010','خسارة المخزون','Inventory loss','expense','debit'),
  ('5011','مكاسب المخزون','Inventory gain','income','credit'),
  ('5020','خسائر التحصيل','Collection losses','expense','debit'),
  ('5030','خسائر فروق الصرف','FX loss','expense','debit'),
  ('5040','أجور التوصيل','Delivery wages','expense','debit'),
  ('5050','مصاريف تشغيلية','Operating expenses','expense','debit');

INSERT INTO "store_settings" ("key","value") VALUES
  ('timezone','Asia/Baghdad'),
  ('delivery_fee','5000'),
  ('acceptance_alert_timeout_minutes','15'),
  ('auto_cancel_enabled','false'),
  ('auto_cancel_timeout_minutes',NULL),
  ('auto_cancel_warning_minutes',NULL),
  ('default_low_stock_threshold','5'),
  ('backdating_window_days','90'),
  ('markup_alert_percent',NULL)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "protection_thresholds" ("key","percent") VALUES
  ('cost',50),('price',50),('quantity',50),('exchange_rate',50)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "business_hours" ("weekday","opens_at","closes_at","is_closed") VALUES
  (0,'09:00','17:00',FALSE),(1,'09:00','17:00',FALSE),(2,'09:00','17:00',FALSE),
  (3,'09:00','17:00',FALSE),(4,'09:00','17:00',FALSE),(5,NULL,NULL,TRUE),(6,'09:00','17:00',FALSE)
ON CONFLICT ("weekday") DO NOTHING;

INSERT INTO "permissions" ("key","group","description") VALUES
  ('fx_rates.update','finance','Update exchange rates'),
  ('ledger.view','finance','View ledger and trial balance'),
  ('ledger.reverse','finance','Reverse posted ledger entries'),
  ('cash_accounts.manage','finance','Manage cash and bank accounts'),
  ('period.reopen','accounting','Reopen closed accounting periods'),
  ('backdate.approve','controls','Approve documents outside the back-dating window')
ON CONFLICT ("key") DO UPDATE SET "group"=EXCLUDED."group", "description"=EXCLUDED."description";

INSERT INTO "preset_permissions" ("preset_id","permission_id")
SELECT pp.id, p.id FROM "permission_presets" pp CROSS JOIN "permissions" p
WHERE pp.name='super_admin' AND p.key IN ('fx_rates.update','ledger.view','ledger.reverse','cash_accounts.manage','period.reopen','backdate.approve')
ON CONFLICT DO NOTHING;
