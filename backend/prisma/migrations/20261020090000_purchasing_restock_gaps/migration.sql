ALTER TABLE "suppliers"
  ADD COLUMN "last_purchase_at" TIMESTAMPTZ(6);

UPDATE "suppliers" AS supplier
SET "last_purchase_at" = activity.last_purchase_at
FROM (
  SELECT "supplier_id", max("received_at") AS last_purchase_at
  FROM "purchase_invoices"
  WHERE "status" = 'posted'
  GROUP BY "supplier_id"
) AS activity
WHERE supplier."id" = activity."supplier_id";

CREATE INDEX "idx_suppliers_recent_purchase"
  ON "suppliers" ("last_purchase_at" DESC, "name", "id");

ALTER TABLE "delivery_parties"
  ADD COLUMN "contact_person" VARCHAR(120);

ALTER TABLE "delivery_parties"
  DROP CONSTRAINT "delivery_parties_kind_check";

ALTER TABLE "delivery_parties"
  ADD CONSTRAINT "delivery_parties_kind_check"
  CHECK ("kind" IN ('internal_agent', 'external_driver', 'courier_company'));
