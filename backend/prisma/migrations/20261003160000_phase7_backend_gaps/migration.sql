-- Preserve every delivery attempt when a failed delivery is retried.
CREATE TABLE "delivery_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "delivery_id" UUID NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "party_id" UUID NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'out_for_delivery',
  "reason" VARCHAR(500),
  "started_at" TIMESTAMPTZ(6) NOT NULL,
  "completed_at" TIMESTAMPTZ(6),
  CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_attempts_delivery_number_key" UNIQUE ("delivery_id", "attempt_number"),
  CONSTRAINT "delivery_attempts_number_check" CHECK ("attempt_number" > 0),
  CONSTRAINT "delivery_attempts_status_check" CHECK ("status" IN ('out_for_delivery','failed','delivered')),
  CONSTRAINT "delivery_attempts_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE CASCADE,
  CONSTRAINT "delivery_attempts_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "users"("id") ON DELETE NO ACTION
);

CREATE INDEX "idx_delivery_attempts_party_time"
  ON "delivery_attempts"("party_id", "started_at" DESC);

-- Existing rows can only expose the latest attempt because older overwritten
-- reasons were never persisted. New retries append one row per attempt.
INSERT INTO "delivery_attempts" (
  "delivery_id", "attempt_number", "party_id", "status", "reason", "started_at", "completed_at"
)
SELECT
  d."id",
  d."retry_count" + 1,
  d."agent_id",
  CASE
    WHEN d."status" = 'failed' THEN 'failed'
    WHEN d."status" IN ('delivered', 'returned') THEN 'delivered'
    ELSE 'out_for_delivery'
  END,
  CASE WHEN d."status" = 'failed' THEN d."failure_reason" ELSE NULL END,
  d."dispatched_at",
  CASE
    WHEN d."status" = 'failed' THEN d."failed_at"
    WHEN d."status" IN ('delivered', 'returned') THEN d."delivered_at"
    ELSE NULL
  END
FROM "deliveries" d
WHERE d."agent_id" IS NOT NULL AND d."dispatched_at" IS NOT NULL;

-- Keep the database allow-lists aligned with the durable inbox contract.
ALTER TABLE "notification_events"
  DROP CONSTRAINT "notification_events_type_check";
ALTER TABLE "notification_events"
  ADD CONSTRAINT "notification_events_type_check" CHECK ("type" IN (
    'order_placed', 'order_confirmed', 'order_status_changed', 'out_for_delivery',
    'delivered', 'delivery_failed', 'return_update', 'loyalty_points_earned',
    'review_moderated', 'promo', 'new_order', 'order_cancelled', 'order_rejected',
    'delivery_assigned', 'order_acceptance_late', 'retrieval_update',
    'quantity_reduction_proposed', 'cancellation_request_approved',
    'cancellation_request_denied'
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
    'cancellation_request_denied'
  ));
