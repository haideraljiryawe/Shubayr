-- P1's internal CLI event must pass the durable outbox constraint. Keep the
-- public notification vocabulary unchanged and require the hidden-test flag.
ALTER TABLE "notification_events"
  DROP CONSTRAINT "notification_events_type_check",
  ADD CONSTRAINT "notification_events_type_check" CHECK (
    "type" IN (
      'order_placed', 'order_confirmed', 'order_status_changed', 'out_for_delivery',
      'delivered', 'delivery_failed', 'return_update', 'loyalty_points_earned',
      'review_moderated', 'promo', 'new_order', 'order_cancelled', 'order_rejected',
      'delivery_assigned', 'order_acceptance_late', 'retrieval_update',
      'quantity_reduction_proposed', 'cancellation_request_approved',
      'cancellation_request_denied', 'price_approval_requested',
      'price_approval_approved', 'price_approval_rejected'
    ) OR ("type" = 'push_test' AND "is_test")
  );
