-- Order delivery fields are immutable snapshots; historical address rows may be deleted.
ALTER TABLE orders DROP CONSTRAINT orders_address_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_address_id_fkey
  FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE SET NULL;
