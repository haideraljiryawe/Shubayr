ALTER TABLE "supplier_payment_allocations"
ADD COLUMN "amount_payment_currency" DECIMAL(20,6);

UPDATE "supplier_payment_allocations" AS allocation
SET "amount_payment_currency" = allocation."payment_iqd" / payment."exchange_rate"
FROM "supplier_payments" AS payment
WHERE payment."id" = allocation."payment_id";

ALTER TABLE "supplier_payment_allocations"
ALTER COLUMN "amount_payment_currency" SET NOT NULL;

ALTER TABLE "supplier_payment_allocations"
ADD CONSTRAINT "supplier_payment_allocations_payment_amount_check"
CHECK ("amount_payment_currency" > 0);
