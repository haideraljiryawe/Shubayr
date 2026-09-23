-- Backfill one baseline tracking event for pre-existing orders. Historical
-- intermediate transitions cannot be reconstructed from the old schema.
INSERT INTO order_status_events (order_id, status, at)
SELECT o.id, o.status, o.placed_at
FROM orders o
WHERE NOT EXISTS (
  SELECT 1 FROM order_status_events e WHERE e.order_id = o.id
);

-- Existing orders are not assigned product-level holds: their physical
-- fulfillment state cannot be inferred safely. The inventory slice must
-- reconcile those historical orders when it introduces FEFO allocation.
