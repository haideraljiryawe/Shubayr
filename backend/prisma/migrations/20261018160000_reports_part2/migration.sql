-- C14b report read paths: all indexes are additive and support as-of/range
-- aggregation without changing posted financial or inventory records.
ALTER TABLE "report_exports"
  DROP CONSTRAINT "report_exports_type_check",
  ADD CONSTRAINT "report_exports_type_check" CHECK (
    "report_type" IN (
      'sales','profitability','profit_loss','trial_balance','balance_sheet',
      'cash','delivery_custody','liabilities','inventory_valuation'
    )
  );

CREATE INDEX IF NOT EXISTS "idx_supplier_entries_report_asof"
  ON "supplier_account_entries" ("accounting_date", "supplier_id");

CREATE INDEX IF NOT EXISTS "idx_expense_payments_report_asof"
  ON "expense_payments" ("accounting_date", "expense_id");

CREATE INDEX IF NOT EXISTS "idx_cash_receipts_report_asof"
  ON "cash_receipt_vouchers" ("accounting_date", "party_id");

CREATE INDEX IF NOT EXISTS "idx_return_refund_payments_report_asof"
  ON "return_refund_payments" ("accounting_date", "collection_id");

CREATE INDEX IF NOT EXISTS "idx_loyalty_ledger_report_asof"
  ON "loyalty_ledger" ("created_at", "account_id");

CREATE INDEX IF NOT EXISTS "idx_stock_movements_custody_report_asof"
  ON "stock_movements" ("custody_party_id", "created_at");
