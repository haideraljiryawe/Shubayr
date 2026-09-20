ALTER TABLE "products" ADD COLUMN "rating_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "order_items" ADD COLUMN "reviewed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "product_reviews"
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "moderation_reason" VARCHAR(500),
  ADD COLUMN "moderated_by" UUID,
  ADD COLUMN "moderated_at" TIMESTAMPTZ(6);
UPDATE "product_reviews" SET "updated_at" = "created_at";

-- The original composite constraint only prevented the same user reviewing
-- one line twice. A purchased order line has exactly one review regardless
-- of user id; nullable legacy rows remain possible but the API requires a line.
CREATE UNIQUE INDEX "product_reviews_order_item_id_key"
  ON "product_reviews"("order_item_id");
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_moderated_by_fkey"
  FOREIGN KEY ("moderated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_status_check"
  CHECK ("status" IN ('pending', 'published', 'rejected'));

UPDATE "order_items" AS item
SET "reviewed" = true
WHERE EXISTS (SELECT 1 FROM "product_reviews" AS review
              WHERE review."order_item_id" = item."id");

-- Published reviews are the source of truth; this is a transactionally
-- maintained catalog cache. PostgreSQL NUMERIC ROUND is half away from zero.
UPDATE "products" SET "rating_count" = 0, "rating_avg" = 0;
UPDATE "products" AS product
SET "rating_count" = counts.review_count,
    "rating_avg" = counts.average_rating
FROM (
  SELECT "product_id", COUNT(*)::integer AS review_count,
         ROUND(AVG("rating")::numeric, 2) AS average_rating
  FROM "product_reviews"
  WHERE "status" = 'published'
  GROUP BY "product_id"
) AS counts
WHERE product."id" = counts."product_id";
