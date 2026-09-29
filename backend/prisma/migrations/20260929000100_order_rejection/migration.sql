-- Add the distinct pending-order rejection outcome and its durable notification.
ALTER TABLE "orders" DROP CONSTRAINT "orders_status_check";
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_check" CHECK ("status" IN (
  'pending', 'confirmed', 'preparing', 'ready_for_dispatch', 'dispatched',
  'delivered', 'failed', 'rejected', 'cancelled', 'return_requested', 'returned'
));

ALTER TABLE "order_status_events" DROP CONSTRAINT "order_status_events_status_check";
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_status_check" CHECK ("status" IN (
  'pending', 'confirmed', 'preparing', 'ready_for_dispatch', 'dispatched',
  'delivered', 'failed', 'rejected', 'cancelled', 'return_requested', 'returned'
));

ALTER TABLE "notification_events" DROP CONSTRAINT "notification_events_type_check";
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_type_check" CHECK ("type" IN (
  'order_placed', 'order_confirmed', 'order_status_changed', 'out_for_delivery',
  'delivered', 'delivery_failed', 'return_update', 'loyalty_points_earned',
  'review_moderated', 'promo', 'new_order', 'order_cancelled', 'order_rejected',
  'delivery_assigned'
));

ALTER TABLE "notification_channel_preferences"
  DROP CONSTRAINT "notification_channel_preferences_type_check";
ALTER TABLE "notification_channel_preferences"
  ADD CONSTRAINT "notification_channel_preferences_type_check" CHECK ("type" IN (
    'order_placed', 'order_confirmed', 'order_status_changed', 'out_for_delivery',
    'delivered', 'delivery_failed', 'return_update', 'loyalty_points_earned',
    'review_moderated', 'promo', 'new_order', 'order_cancelled', 'order_rejected',
    'delivery_assigned'
  ));
