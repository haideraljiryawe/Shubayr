-- Canonicalize the pre-dispatch and delivery-driven order lifecycle.
UPDATE orders SET status = 'preparing' WHERE status = 'processing';
UPDATE orders SET status = 'dispatched' WHERE status = 'out_for_delivery';
UPDATE orders SET status = 'failed' WHERE status = 'failed_delivery';
UPDATE order_status_events SET status = 'preparing' WHERE status = 'processing';
UPDATE order_status_events SET status = 'dispatched' WHERE status = 'out_for_delivery';
UPDATE order_status_events SET status = 'failed' WHERE status = 'failed_delivery';

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check CHECK (status IN (
    'pending', 'confirmed', 'preparing', 'ready_for_dispatch', 'dispatched',
    'delivered', 'failed', 'cancelled', 'return_requested', 'returned'
  ));

ALTER TABLE order_status_events
  ADD CONSTRAINT order_status_events_status_check CHECK (status IN (
    'pending', 'confirmed', 'preparing', 'ready_for_dispatch', 'dispatched',
    'delivered', 'failed', 'cancelled', 'return_requested', 'returned'
  ));

-- The minimal fulfillment slice tracks whether checkout stock is still held,
-- permanently deducted at dispatch, or released by pre-dispatch cancellation.
ALTER TABLE simple_stock_holds
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'held',
  ADD COLUMN deducted_at TIMESTAMPTZ;

UPDATE simple_stock_holds h
SET status = CASE
      WHEN o.status = 'cancelled' THEN 'released'
      WHEN o.status IN ('dispatched', 'delivered', 'failed', 'return_requested', 'returned') THEN 'deducted'
      ELSE 'held'
    END,
    released_at = CASE
      WHEN o.status = 'cancelled' THEN COALESCE(h.released_at, now())
      ELSE NULL
    END,
    deducted_at = CASE
      WHEN o.status IN ('dispatched', 'delivered', 'failed', 'return_requested', 'returned') THEN now()
      ELSE NULL
    END
FROM orders o
WHERE o.id = h.order_id;

ALTER TABLE simple_stock_holds
  ADD CONSTRAINT simple_stock_holds_status_check CHECK (
    (status = 'held' AND deducted_at IS NULL AND released_at IS NULL) OR
    (status = 'deducted' AND deducted_at IS NOT NULL AND released_at IS NULL) OR
    (status = 'released' AND deducted_at IS NULL AND released_at IS NOT NULL)
  );

DROP INDEX simple_stock_holds_product_id_variant_id_released_at_idx;
CREATE INDEX simple_stock_holds_product_id_variant_id_status_idx
  ON simple_stock_holds(product_id, variant_id, status);
CREATE INDEX idx_orders_admin_stable ON orders(placed_at DESC, id DESC);
CREATE INDEX idx_orders_admin_status_stable ON orders(status, placed_at DESC, id DESC);
CREATE INDEX idx_orders_admin_customer_stable ON orders(user_id, placed_at DESC, id DESC);

-- Existing installations receive the new single permission during migrate;
-- fresh installations also receive it from the idempotent seed.
INSERT INTO permissions(key, "group", description)
VALUES ('orders.manage', 'orders', 'Manage staff order fulfillment')
ON CONFLICT (key) DO UPDATE SET
  "group" = EXCLUDED."group",
  description = EXCLUDED.description;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key = 'orders.manage'
WHERE r.name IN ('admin', 'manager')
ON CONFLICT DO NOTHING;
