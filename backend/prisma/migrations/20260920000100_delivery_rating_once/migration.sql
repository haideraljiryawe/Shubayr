-- Delivery ratings were previously unique per delivery/customer. A delivery
-- has exactly one owning customer, so enforce the one-rating rule in the DB.
-- No backfill is needed: this feature did not write delivery ratings before
-- this migration. Existing duplicate rows, if introduced outside the API,
-- must be resolved before deployment rather than silently discarded.
CREATE UNIQUE INDEX "delivery_ratings_delivery_id_key" ON "delivery_ratings"("delivery_id");
