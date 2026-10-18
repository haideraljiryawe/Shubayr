-- Task D1: governorate delivery zones, confirmation-time fee adjustment,
-- and tiered automatic order discounts with immutable order snapshots.

CREATE TABLE "delivery_zones" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name_ar" VARCHAR(120) NOT NULL,
  "name_en" VARCHAR(120) NOT NULL,
  "fee_iqd" DECIMAL(20,6) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_zones_fee_check" CHECK ("fee_iqd" >= 0 AND "fee_iqd" = round("fee_iqd"))
);

CREATE TABLE "governorates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(32) NOT NULL,
  "name_ar" VARCHAR(120) NOT NULL,
  "name_en" VARCHAR(120) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "delivery_zone_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "governorates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "governorates_code_key" UNIQUE ("code"),
  CONSTRAINT "governorates_delivery_zone_id_fkey" FOREIGN KEY ("delivery_zone_id") REFERENCES "delivery_zones"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE INDEX "idx_governorates_delivery_zone" ON "governorates"("delivery_zone_id");

INSERT INTO "governorates" ("code", "name_ar", "name_en") VALUES
  ('baghdad', 'بغداد', 'Baghdad'),
  ('basra', 'البصرة', 'Basra'),
  ('nineveh', 'نينوى', 'Nineveh'),
  ('erbil', 'أربيل', 'Erbil'),
  ('sulaymaniyah', 'السليمانية', 'Sulaymaniyah'),
  ('duhok', 'دهوك', 'Duhok'),
  ('kirkuk', 'كركوك', 'Kirkuk'),
  ('diyala', 'ديالى', 'Diyala'),
  ('anbar', 'الأنبار', 'Anbar'),
  ('babil', 'بابل', 'Babil'),
  ('karbala', 'كربلاء', 'Karbala'),
  ('najaf', 'النجف', 'Najaf'),
  ('wasit', 'واسط', 'Wasit'),
  ('maysan', 'ميسان', 'Maysan'),
  ('dhi-qar', 'ذي قار', 'Dhi Qar'),
  ('muthanna', 'المثنى', 'Muthanna'),
  ('qadisiyyah', 'القادسية', 'Qadisiyyah'),
  ('saladin', 'صلاح الدين', 'Saladin'),
  ('halabja', 'حلبجة', 'Halabja')
ON CONFLICT ("code") DO UPDATE SET
  "name_ar" = EXCLUDED."name_ar",
  "name_en" = EXCLUDED."name_en";

ALTER TABLE "addresses"
  ADD COLUMN "governorate_id" UUID,
  ADD CONSTRAINT "addresses_governorate_id_fkey" FOREIGN KEY ("governorate_id") REFERENCES "governorates"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE INDEX "idx_addresses_governorate" ON "addresses"("governorate_id");

CREATE TABLE "discount_tiers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "min_subtotal_iqd" DECIMAL(20,6) NOT NULL,
  "percent" DECIMAL(5,2) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "discount_tiers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "discount_tiers_min_subtotal_key" UNIQUE ("min_subtotal_iqd"),
  CONSTRAINT "discount_tiers_values_check" CHECK (
    "min_subtotal_iqd" >= 0 AND "min_subtotal_iqd" = round("min_subtotal_iqd")
    AND "percent" > 0 AND "percent" <= 50
  )
);

ALTER TABLE "orders"
  ADD COLUMN "original_delivery_fee" DECIMAL(20,6) NOT NULL DEFAULT 0,
  ADD COLUMN "adjusted_delivery_fee" DECIMAL(20,6),
  ADD COLUMN "delivery_fee_adjustment_reason" VARCHAR(500),
  ADD COLUMN "delivery_fee_adjusted_by" UUID,
  ADD COLUMN "delivery_fee_adjusted_at" TIMESTAMPTZ(6),
  ADD COLUMN "discount_source" VARCHAR(20) NOT NULL DEFAULT 'none',
  ADD COLUMN "coupon_discount" DECIMAL(20,6) NOT NULL DEFAULT 0,
  ADD COLUMN "tier_discount" DECIMAL(20,6) NOT NULL DEFAULT 0,
  ADD COLUMN "discount_tier_id" UUID,
  ADD COLUMN "discount_tier_min_subtotal" DECIMAL(20,6),
  ADD COLUMN "discount_tier_percent" DECIMAL(5,2),
  ADD COLUMN "next_discount_tier_min_subtotal" DECIMAL(20,6),
  ADD COLUMN "next_discount_tier_percent" DECIMAL(5,2),
  ADD COLUMN "next_discount_tier_amount_remaining" DECIMAL(20,6),
  ADD COLUMN "delivery_governorate_code" VARCHAR(32),
  ADD COLUMN "delivery_governorate_name_ar" VARCHAR(120),
  ADD COLUMN "delivery_governorate_name_en" VARCHAR(120),
  ADD COLUMN "customer_contacted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "customer_contact_note" VARCHAR(500),
  ADD CONSTRAINT "orders_delivery_fee_adjusted_by_fkey" FOREIGN KEY ("delivery_fee_adjusted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "orders_discount_tier_id_fkey" FOREIGN KEY ("discount_tier_id") REFERENCES "discount_tiers"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  ADD CONSTRAINT "orders_delivery_fee_values_check" CHECK (
    "delivery_fee" >= 0 AND "original_delivery_fee" >= 0
    AND ("adjusted_delivery_fee" IS NULL OR "adjusted_delivery_fee" >= 0)
  ),
  ADD CONSTRAINT "orders_delivery_fee_adjustment_check" CHECK (
    ("adjusted_delivery_fee" IS NULL AND "delivery_fee_adjustment_reason" IS NULL AND "delivery_fee_adjusted_by" IS NULL AND "delivery_fee_adjusted_at" IS NULL)
    OR
    ("adjusted_delivery_fee" IS NOT NULL AND length(btrim("delivery_fee_adjustment_reason")) > 0 AND "delivery_fee_adjusted_by" IS NOT NULL AND "delivery_fee_adjusted_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "orders_discount_source_check" CHECK ("discount_source" IN ('none','coupon','tier','stacked'));

UPDATE "orders" SET
  "original_delivery_fee" = "delivery_fee",
  "coupon_discount" = "discount",
  "discount_source" = CASE WHEN "discount" > 0 THEN 'coupon' ELSE 'none' END;

ALTER TABLE "order_items"
  ADD COLUMN "discount_share" DECIMAL(20,6),
  ADD COLUMN "net_line_total" DECIMAL(20,6);

WITH exact AS (
  SELECT
    item."id",
    item."order_id",
    item."line_total",
    CASE WHEN "order"."subtotal" > 0
      THEN LEAST("order"."discount", "order"."subtotal") * item."line_total" / "order"."subtotal"
      ELSE 0
    END AS exact_share
  FROM "order_items" item
  JOIN "orders" "order" ON "order"."id" = item."order_id"
), ranked AS (
  SELECT
    exact.*,
    floor(exact_share) AS base_share,
    row_number() OVER (PARTITION BY "order_id" ORDER BY exact_share - floor(exact_share) DESC, "id") AS remainder_rank
  FROM exact
), allocated AS (
  SELECT
    ranked.*,
    round(sum(exact_share) OVER (PARTITION BY "order_id")) - sum(base_share) OVER (PARTITION BY "order_id") AS remainder_units
  FROM ranked
)
UPDATE "order_items" item SET
  "discount_share" = allocated.base_share + CASE WHEN allocated.remainder_rank <= allocated.remainder_units THEN 1 ELSE 0 END,
  "net_line_total" = allocated."line_total" - allocated.base_share - CASE WHEN allocated.remainder_rank <= allocated.remainder_units THEN 1 ELSE 0 END
FROM allocated
WHERE allocated."id" = item."id";

UPDATE "order_items" SET
  "discount_share" = COALESCE("discount_share", 0),
  "net_line_total" = COALESCE("net_line_total", "line_total");

ALTER TABLE "order_items"
  ALTER COLUMN "discount_share" SET NOT NULL,
  ALTER COLUMN "discount_share" SET DEFAULT 0,
  ALTER COLUMN "net_line_total" SET NOT NULL,
  ALTER COLUMN "net_line_total" SET DEFAULT 0,
  ADD CONSTRAINT "order_items_net_values_check" CHECK ("discount_share" >= 0 AND "net_line_total" >= 0 AND "discount_share" + "net_line_total" = "line_total");

ALTER TABLE "return_items"
  ADD COLUMN "discount_share" DECIMAL(20,6),
  ADD COLUMN "net_amount" DECIMAL(20,6);

UPDATE "return_items" returned SET
  "net_amount" = round(item."net_line_total" * returned."quantity" / item."quantity"),
  "discount_share" = round(returned."unit_price" * returned."quantity") - round(item."net_line_total" * returned."quantity" / item."quantity")
FROM "order_items" item
WHERE item."id" = returned."order_item_id";

UPDATE "return_items" SET
  "net_amount" = COALESCE("net_amount", round("unit_price" * "quantity")),
  "discount_share" = COALESCE("discount_share", 0);

ALTER TABLE "return_items"
  ALTER COLUMN "discount_share" SET NOT NULL,
  ALTER COLUMN "discount_share" SET DEFAULT 0,
  ALTER COLUMN "net_amount" SET NOT NULL,
  ALTER COLUMN "net_amount" SET DEFAULT 0,
  ADD CONSTRAINT "return_items_net_values_check" CHECK ("discount_share" >= 0 AND "net_amount" >= 0);

INSERT INTO "store_settings" ("key", "value") VALUES
  ('discount_tier_coupon_stacking_enabled', 'false')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "permissions" ("key", "group", "description") VALUES
  ('delivery_zones.manage', 'settings', 'Manage governorates and delivery zones'),
  ('discount_tiers.manage', 'settings', 'Manage automatic order discount tiers'),
  ('orders.adjust_delivery_fee', 'orders', 'Adjust an order delivery fee while confirming it')
ON CONFLICT ("key") DO UPDATE SET
  "group" = EXCLUDED."group",
  "description" = EXCLUDED."description";

INSERT INTO "preset_permissions" ("preset_id", "permission_id")
SELECT preset."id", permission."id"
FROM "permission_presets" preset
CROSS JOIN "permissions" permission
WHERE preset."name" = 'super_admin'
  AND permission."key" IN ('delivery_zones.manage', 'discount_tiers.manage', 'orders.adjust_delivery_fee')
ON CONFLICT ("preset_id", "permission_id") DO NOTHING;
