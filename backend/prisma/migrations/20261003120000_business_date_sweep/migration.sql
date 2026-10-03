-- Business dates are supplied by the Asia/Baghdad application helper. Keeping
-- a database-session CURRENT_DATE fallback can silently assign the prior day
-- during Baghdad's 00:00-03:00 boundary.
ALTER TABLE "orders"
  ALTER COLUMN "document_date" DROP DEFAULT,
  ALTER COLUMN "accounting_date" DROP DEFAULT;

ALTER TABLE "payments"
  ALTER COLUMN "document_date" DROP DEFAULT,
  ALTER COLUMN "accounting_date" DROP DEFAULT;

ALTER TABLE "returns"
  ALTER COLUMN "document_date" DROP DEFAULT,
  ALTER COLUMN "accounting_date" DROP DEFAULT;
