-- Keep account deletion's address removal and the orders FK SET NULL lookup
-- scoped to one customer/address. Table scans widen lock contention.
CREATE INDEX "idx_addresses_user" ON "addresses"("user_id");
CREATE INDEX "idx_orders_address" ON "orders"("address_id");
