ALTER TABLE "banners"
  ADD COLUMN "internal_name" VARCHAR(200),
  ADD COLUMN "title_ar" VARCHAR(200),
  ADD COLUMN "title_en" VARCHAR(200),
  ADD COLUMN "subtitle_ar" TEXT,
  ADD COLUMN "subtitle_en" TEXT,
  ADD COLUMN "cta_label_ar" VARCHAR(120),
  ADD COLUMN "cta_label_en" VARCHAR(120),
  ADD COLUMN "show_text" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "action_type" VARCHAR(20) NOT NULL DEFAULT 'none',
  ADD COLUMN "action_target_id" UUID,
  ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "default_priority" INTEGER NOT NULL DEFAULT 0;

UPDATE "banners"
SET "action_type" = CASE WHEN "link_url" IS NULL THEN 'none' ELSE 'url' END;

ALTER TABLE "banners"
  ADD CONSTRAINT "banners_action_type_check"
    CHECK ("action_type" IN ('none', 'url', 'product', 'category', 'offers')),
  ADD CONSTRAINT "banners_default_priority_check"
    CHECK ("default_priority" >= 0);

CREATE INDEX "idx_banners_defaults"
  ON "banners" ("is_default", "is_active", "default_priority", "id");

ALTER TABLE "products"
  ADD COLUMN "purchase_limit_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "purchase_limit_max_quantity" NUMERIC(20,3),
  ADD CONSTRAINT "products_purchase_limit_check"
    CHECK (
      (NOT "purchase_limit_enabled")
      OR (
        "purchase_limit_max_quantity" IS NOT NULL
        AND "purchase_limit_max_quantity" > 0
      )
    );

CREATE INDEX "idx_products_recently_added"
  ON "products" ("created_at" DESC, "id" DESC)
  WHERE "status" = 'active' AND "published_at" IS NOT NULL;

INSERT INTO "store_settings" ("key", "value") VALUES
  ('recently_added_enabled', 'false'),
  ('recently_added_max_count', '10'),
  ('recently_added_window_days', '30')
ON CONFLICT ("key") DO NOTHING;
