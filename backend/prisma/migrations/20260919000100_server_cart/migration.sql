-- One authenticated cart per account. Existing duplicate carts are merged
-- without dropping their lines; the app computes all retained line totals.
-- Backfill runs before the unique index so deploy is safe on old databases.
WITH canonical AS (
  SELECT DISTINCT ON (user_id) user_id, id AS keep_id
  FROM carts ORDER BY user_id, updated_at DESC, id
)
UPDATE cart_items item
SET cart_id = canonical.keep_id
FROM carts old_cart, canonical
WHERE item.cart_id = old_cart.id
  AND old_cart.user_id = canonical.user_id
  AND old_cart.id <> canonical.keep_id;

WITH canonical AS (
  SELECT DISTINCT ON (user_id) user_id, id AS keep_id
  FROM carts ORDER BY user_id, updated_at DESC, id
)
DELETE FROM carts old_cart
USING canonical
WHERE old_cart.user_id = canonical.user_id
  AND old_cart.id <> canonical.keep_id;

CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");
ALTER TABLE "carts" ADD COLUMN "coupon_id" UUID;
ALTER TABLE "carts" ADD CONSTRAINT "carts_coupon_id_fkey"
  FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- Rollback: take a backup before deploy, stop writes, restore that backup and
-- the previous app build. Do not drop the unique index while newer carts write.
