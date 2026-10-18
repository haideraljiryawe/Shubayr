CREATE INDEX "idx_order_items_report_dimensions"
ON "order_items"("order_id", "variant_id", "product_id");

-- C12 protected every posted field at the database layer, but its transition
-- guard accidentally rejected all draft-to-draft edits. Keep the immutable
-- posted/reversed protections and permit only drafts to change in place.
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
