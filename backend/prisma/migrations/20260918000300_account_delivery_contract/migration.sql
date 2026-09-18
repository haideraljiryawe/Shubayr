-- Accounts/delivery contract migration.
-- Backfill: address contacts inherit the owning user's current phone. Existing
-- orders snapshot their referenced address and contact; missing legacy cities
-- become an empty snapshot value and should be corrected operationally. The
-- first delivery by UUID is selected for legacy orders with multiple rows.
-- Notification preferences use documented defaults and are lazily created, so
-- no user rows need to be inserted here.
-- Rollback: restore the pre-deploy backup. A compensating migration may drop
-- notification_preferences and the new order/address columns only after the
-- application is rolled back and snapshot data is no longer required.

ALTER TABLE "addresses"
  ADD COLUMN "contact_phone" VARCHAR(32),
  ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "addresses" AS address
SET "contact_phone" = owner."phone",
    "city" = COALESCE(address."city", '')
FROM "users" AS owner
WHERE owner."id" = address."user_id";

ALTER TABLE "addresses"
  ALTER COLUMN "contact_phone" SET NOT NULL,
  ALTER COLUMN "city" SET NOT NULL;

WITH chosen AS (
  SELECT DISTINCT ON ("user_id") "id"
  FROM "addresses"
  ORDER BY "user_id", "is_default" DESC, "created_at", "id"
)
UPDATE "addresses" AS address
SET "is_default" = EXISTS (
  SELECT 1 FROM chosen WHERE chosen."id" = address."id"
);

CREATE UNIQUE INDEX "idx_addresses_one_default_per_user"
  ON "addresses"("user_id") WHERE "is_default";

CREATE TABLE "notification_preferences" (
  "user_id" UUID NOT NULL,
  "order_updates" BOOLEAN NOT NULL DEFAULT true,
  "delivery_updates" BOOLEAN NOT NULL DEFAULT true,
  "return_updates" BOOLEAN NOT NULL DEFAULT true,
  "loyalty_updates" BOOLEAN NOT NULL DEFAULT true,
  "promotions" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "orders"
  ADD COLUMN "delivery_id" UUID,
  ADD COLUMN "delivery_contact_phone" VARCHAR(32),
  ADD COLUMN "delivery_address_label" VARCHAR(80),
  ADD COLUMN "delivery_city" VARCHAR(80),
  ADD COLUMN "delivery_area" VARCHAR(120),
  ADD COLUMN "delivery_street" VARCHAR(160),
  ADD COLUMN "delivery_details" TEXT,
  ADD COLUMN "delivery_lat" DOUBLE PRECISION,
  ADD COLUMN "delivery_lng" DOUBLE PRECISION;

WITH snapshots AS (
  SELECT
    placed_order."id",
    COALESCE(address."contact_phone", customer."phone") AS contact_phone,
    address."label",
    COALESCE(address."city", '') AS city,
    address."area",
    address."street",
    address."details",
    address."lat",
    address."lng"
  FROM "orders" AS placed_order
  JOIN "users" AS customer ON customer."id" = placed_order."user_id"
  LEFT JOIN "addresses" AS address ON address."id" = placed_order."address_id"
)
UPDATE "orders" AS placed_order
SET
  "delivery_contact_phone" = snapshots.contact_phone,
  "delivery_address_label" = snapshots.label,
  "delivery_city" = snapshots.city,
  "delivery_area" = snapshots.area,
  "delivery_street" = snapshots.street,
  "delivery_details" = snapshots.details,
  "delivery_lat" = snapshots.lat,
  "delivery_lng" = snapshots.lng
FROM snapshots
WHERE snapshots."id" = placed_order."id";

WITH first_delivery AS (
  SELECT DISTINCT ON ("order_id") "order_id", "id"
  FROM "deliveries"
  ORDER BY "order_id", "id"
)
UPDATE "orders" AS placed_order
SET "delivery_id" = selected."id"
FROM first_delivery AS selected
WHERE selected."order_id" = placed_order."id";

ALTER TABLE "orders"
  ALTER COLUMN "delivery_contact_phone" SET NOT NULL,
  ALTER COLUMN "delivery_city" SET NOT NULL,
  ADD CONSTRAINT "orders_delivery_id_fkey" FOREIGN KEY ("delivery_id")
    REFERENCES "deliveries"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE UNIQUE INDEX "orders_delivery_id_key" ON "orders"("delivery_id");
