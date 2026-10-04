ALTER TABLE "price_publish_approvals"
  ADD COLUMN "kind" VARCHAR(20) NOT NULL DEFAULT 'linked',
  ADD COLUMN "product_id" UUID,
  ADD COLUMN "fixed_payload" JSONB,
  ADD COLUMN "sku_list" VARCHAR(80)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(80)[];

ALTER TABLE "price_publish_approvals"
  ADD CONSTRAINT "price_publish_approvals_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX "idx_price_publish_approvals_proposer"
  ON "price_publish_approvals"("proposed_by", "created_at" DESC);

CREATE INDEX "idx_price_publish_approvals_product"
  ON "price_publish_approvals"("product_id", "created_at" DESC);

ALTER TABLE "price_publish_approvals"
  ADD CONSTRAINT "price_publish_approvals_kind_check"
  CHECK ("kind" IN ('linked', 'fixed'));

-- Keep the durable inbox allow-lists aligned with the three price-approval
-- events introduced by this migration.
ALTER TABLE "notification_events"
  DROP CONSTRAINT "notification_events_type_check";
ALTER TABLE "notification_events"
  ADD CONSTRAINT "notification_events_type_check" CHECK ("type" IN (
    'order_placed', 'order_confirmed', 'order_status_changed', 'out_for_delivery',
    'delivered', 'delivery_failed', 'return_update', 'loyalty_points_earned',
    'review_moderated', 'promo', 'new_order', 'order_cancelled', 'order_rejected',
    'delivery_assigned', 'order_acceptance_late', 'retrieval_update',
    'quantity_reduction_proposed', 'cancellation_request_approved',
    'cancellation_request_denied', 'price_approval_requested',
    'price_approval_approved', 'price_approval_rejected'
  ));

ALTER TABLE "notification_channel_preferences"
  DROP CONSTRAINT "notification_channel_preferences_type_check";
ALTER TABLE "notification_channel_preferences"
  ADD CONSTRAINT "notification_channel_preferences_type_check" CHECK ("type" IN (
    'order_placed', 'order_confirmed', 'order_status_changed', 'out_for_delivery',
    'delivered', 'delivery_failed', 'return_update', 'loyalty_points_earned',
    'review_moderated', 'promo', 'new_order', 'order_cancelled', 'order_rejected',
    'delivery_assigned', 'order_acceptance_late', 'retrieval_update',
    'quantity_reduction_proposed', 'cancellation_request_approved',
    'cancellation_request_denied', 'price_approval_requested',
    'price_approval_approved', 'price_approval_rejected'
  ));
