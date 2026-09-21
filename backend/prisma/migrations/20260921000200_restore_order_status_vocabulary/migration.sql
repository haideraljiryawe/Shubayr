ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE order_status_events DROP CONSTRAINT IF EXISTS order_status_events_status_check;

UPDATE orders SET status = 'processing' WHERE status = 'preparing';
UPDATE orders SET status = 'out_for_delivery' WHERE status = 'dispatched';
UPDATE orders SET status = 'failed_delivery' WHERE status = 'failed';
UPDATE order_status_events SET status = 'processing' WHERE status = 'preparing';
UPDATE order_status_events SET status = 'out_for_delivery' WHERE status = 'dispatched';
UPDATE order_status_events SET status = 'failed_delivery' WHERE status = 'failed';

ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (
  'pending', 'confirmed', 'processing', 'ready_for_dispatch', 'out_for_delivery',
  'delivered', 'failed_delivery', 'cancelled', 'return_requested', 'returned'
));
ALTER TABLE order_status_events ADD CONSTRAINT order_status_events_status_check CHECK (status IN (
  'pending', 'confirmed', 'processing', 'ready_for_dispatch', 'out_for_delivery',
  'delivered', 'failed_delivery', 'cancelled', 'return_requested', 'returned'
));
