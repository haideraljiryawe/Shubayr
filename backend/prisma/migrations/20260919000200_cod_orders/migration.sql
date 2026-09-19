ALTER TABLE orders
  ADD COLUMN idempotency_key VARCHAR(128),
  ADD COLUMN idempotency_fingerprint VARCHAR(64);

CREATE UNIQUE INDEX orders_user_id_idempotency_key_key
  ON orders(user_id, idempotency_key);

CREATE TABLE order_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL,
  note TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_status_events_order_id_at_idx ON order_status_events(order_id, at);


-- A temporary product/variant-level sellable-stock hold. No batch is selected
-- here; FEFO batch reservation and picking belong to the inventory slice.
CREATE TABLE simple_stock_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  variant_id UUID REFERENCES product_variants(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  released_at TIMESTAMPTZ
);
CREATE INDEX simple_stock_holds_product_id_variant_id_released_at_idx
  ON simple_stock_holds(product_id, variant_id, released_at);
