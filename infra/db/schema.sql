-- =====================================================================
-- SHUBAYR — Authoritative Database Schema (PostgreSQL)
-- Version 2.0 — incorporates the team review (suppliers, batches,
-- warehouses/locations, stock movements, FEFO, reservations, picking,
-- returns, loyalty, split ratings, RBAC, audit trail, white-label).
--
-- Bootstrap/reference for clean databases. Prisma Migrate files under
-- backend/prisma/migrations are the production upgrade path. Keep this file,
-- schema.prisma, migrations, and OpenAPI synchronized in the same PR.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- Financial policy: monetary values use NUMERIC(*,2). Application calculations
-- use integer minor units and round half away from zero once at each resulting
-- money boundary. Percentages have at most two fractional digits.

-- ---------------------------------------------------------------------
-- 0. WHITE-LABEL / STORE SETTINGS
-- ---------------------------------------------------------------------
CREATE TABLE store_settings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key             VARCHAR(120) UNIQUE NOT NULL,   -- e.g. store_name, logo_url, primary_color, currency
    value           TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Seed suggestion: store_name='Shubayr', currency='IQD', primary_color='#0B2A54'

-- ---------------------------------------------------------------------
-- 1. RBAC — ROLES & PERMISSIONS (detailed from the start)
-- ---------------------------------------------------------------------
CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(80) UNIQUE NOT NULL,    -- admin, manager, purchasing, warehouse, delivery, customer, ...
    description     VARCHAR(255),
    is_system       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key             VARCHAR(120) UNIQUE NOT NULL,   -- e.g. products.create, orders.confirm, stock.adjust
    "group"         VARCHAR(80) NOT NULL,           -- catalog, orders, inventory, purchasing, users, reports
    description     VARCHAR(255)
);

CREATE TABLE role_permissions (
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id   UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- ---------------------------------------------------------------------
-- 2. USERS & ADDRESSES
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id         UUID NOT NULL REFERENCES roles(id),
    name            VARCHAR(120),
    phone           VARCHAR(32) UNIQUE NOT NULL,
    email           VARCHAR(160),
    password_hash   VARCHAR(255),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE otp_codes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone           VARCHAR(32) NOT NULL,
    code_hash       VARCHAR(255) NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    consumed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_codes_phone_active ON otp_codes(phone, consumed_at, created_at);

-- Refresh tokens are rotated on every use. Only a SHA-256 token digest is
-- stored, so a database read cannot be used as a bearer credential.
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expiry ON refresh_tokens(expires_at);

CREATE TABLE media_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_key VARCHAR(512) NOT NULL UNIQUE,
  public_url TEXT NOT NULL UNIQUE,
  mime_type VARCHAR(80) NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  checksum VARCHAR(64) NOT NULL,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_objects_uploader ON media_objects(uploaded_by);

CREATE TABLE addresses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label           VARCHAR(80),
    city            VARCHAR(80) NOT NULL,
    area            VARCHAR(120),
    street          VARCHAR(160),
    details         TEXT,
    contact_phone   VARCHAR(32) NOT NULL,
    lat             DOUBLE PRECISION,
    lng             DOUBLE PRECISION,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Push device tokens are unique globally and can move between accounts.
CREATE TABLE device_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token           VARCHAR(512) NOT NULL,
    platform        VARCHAR(16) NOT NULL,   -- android | ios | web
    locale          VARCHAR(8),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deactivated_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT device_tokens_token_key UNIQUE (token),
    CONSTRAINT device_tokens_platform_check CHECK (platform IN ('android', 'ios', 'web'))
);

CREATE TABLE notification_preferences (
    user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    order_updates       BOOLEAN NOT NULL DEFAULT TRUE,
    delivery_updates    BOOLEAN NOT NULL DEFAULT TRUE,
    return_updates      BOOLEAN NOT NULL DEFAULT TRUE,
    loyalty_updates     BOOLEAN NOT NULL DEFAULT TRUE,
    promotions          BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_channel_preferences (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(40) NOT NULL,
    channel VARCHAR(8) NOT NULL,
    enabled BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT notification_channel_preferences_pkey PRIMARY KEY (user_id, type, channel),
    CONSTRAINT notification_channel_preferences_type_check CHECK (type IN
      ('order_placed','order_confirmed','order_status_changed','out_for_delivery','delivered',
       'delivery_failed','return_update','loyalty_points_earned','review_moderated','promo')),
    CONSTRAINT notification_channel_preferences_channel_check CHECK (channel IN ('push','sms')),
    CONSTRAINT notification_channel_preferences_critical_check
      CHECK (NOT (type = 'order_confirmed' AND channel = 'sms' AND enabled = false))
);

CREATE TABLE notification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_key VARCHAR(160) NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(40) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    enqueued_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    CONSTRAINT notification_events_type_check CHECK (type IN
      ('order_placed','order_confirmed','order_status_changed','out_for_delivery','delivered',
       'delivery_failed','return_update','loyalty_points_earned','review_moderated','promo'))
);

CREATE TABLE notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES notification_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(40) NOT NULL,
    channel VARCHAR(8) NOT NULL CHECK (channel IN ('push','sms')),
    delivery_key VARCHAR(120) NOT NULL UNIQUE,
    status VARCHAR(8) NOT NULL CHECK (status IN ('queued','sent','skipped','failed')),
    locale VARCHAR(8) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    error VARCHAR(500)
);

-- ---------------------------------------------------------------------
-- 3. CATALOG
-- ---------------------------------------------------------------------
CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id       UUID REFERENCES categories(id) ON DELETE SET NULL,
    name_en         VARCHAR(120) NOT NULL,
    name_ar         VARCHAR(120) NOT NULL,
    slug            VARCHAR(140),
    description_en  TEXT,
    description_ar  TEXT,
    image_url       TEXT,
    icon_key        VARCHAR(80),                     -- semantic key, never a UI codepoint
    sort_order      INT NOT NULL DEFAULT 0,
    is_visible      BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT categories_not_self_parent CHECK (id <> parent_id)
);

-- Home hero banners; public reads return active banners ordered by sort_order.
CREATE TABLE banners (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(200) NOT NULL,
    subtitle        TEXT,
    image_url       TEXT NOT NULL,
    cta_text        VARCHAR(120),
    link_url        TEXT,
    sort_order      INT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at       TIMESTAMPTZ,
    ends_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id     UUID NOT NULL REFERENCES categories(id),
    name_en         VARCHAR(200) NOT NULL,
    name_ar         VARCHAR(200) NOT NULL,
    description     TEXT,
    price           NUMERIC(12,2) NOT NULL DEFAULT 0,   -- regular selling price (separate from purchase cost)
    -- Discount DEFINITION only. The effective price, on_sale flag and
    -- discount_percent are derived at read time because the scheduled window
    -- below makes them change with the clock; never store them.
    discount_type   VARCHAR(10) CHECK (discount_type IN ('percentage','amount')), -- NULL = no discount
    discount_value  NUMERIC(12,2),                      -- percentage: 10 = 10%; amount: currency subtracted
    discount_starts_at TIMESTAMPTZ,                     -- window start; NULL = active immediately
    discount_ends_at   TIMESTAMPTZ,                     -- window end;   NULL = no end
    is_negotiable   BOOLEAN NOT NULL DEFAULT FALSE,     -- points negotiation support
    floor_price     NUMERIC(12,2),                      -- lowest acceptable negotiated price
    points_price    INT,                                -- cost in loyalty points, if redeemable
    tracks_expiry   BOOLEAN NOT NULL DEFAULT FALSE,     -- true => FEFO applies
    rating_avg      NUMERIC(3,2) NOT NULL DEFAULT 0,
    rating_count    INT NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'active', -- active | hidden | archived
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- A discount is either fully defined or absent.
    CONSTRAINT products_discount_value_present CHECK (
        (discount_type IS NULL AND discount_value IS NULL)
        OR (discount_type IS NOT NULL AND discount_value IS NOT NULL)
    ),
    -- percentage: 0 < value <= 100; amount: 0 < value < price.
    CONSTRAINT products_discount_value_range CHECK (
        discount_type IS NULL
        OR (discount_type = 'percentage' AND discount_value > 0 AND discount_value <= 100)
        OR (discount_type = 'amount'     AND discount_value > 0 AND discount_value < price)
    ),
    -- A bounded window must move forward in time.
    CONSTRAINT products_discount_window CHECK (
        discount_starts_at IS NULL
        OR discount_ends_at IS NULL
        OR discount_ends_at > discount_starts_at
    ),
    CONSTRAINT products_negotiation_values_check CHECK (
        (floor_price IS NULL OR (floor_price >= 0 AND floor_price <= price))
        AND (points_price IS NULL OR points_price >= 0)
    )
);

CREATE TABLE product_variants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku             VARCHAR(80) UNIQUE NOT NULL,
    attributes      JSONB,                              -- {"color":"black","size":"L"}
    price_delta     NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE product_images (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    url             VARCHAR(400) NOT NULL,
    sort_order      INT NOT NULL DEFAULT 0,
    UNIQUE (product_id, sort_order)
);

-- ---------------------------------------------------------------------
-- 4. SUPPLIERS & PURCHASING  (goods enter ONLY via purchase invoices)
-- ---------------------------------------------------------------------
CREATE TABLE suppliers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(160) NOT NULL,
    phone           VARCHAR(32),
    email           VARCHAR(160),
    address         TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_invoices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id     UUID NOT NULL REFERENCES suppliers(id),
    invoice_number  VARCHAR(80),
    total_cost      NUMERIC(14,2) NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft | received | posted | cancelled
    received_at     TIMESTAMPTZ,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_invoice_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id      UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id),
    variant_id      UUID REFERENCES product_variants(id),
    quantity        INT NOT NULL CHECK (quantity > 0),
    unit_cost       NUMERIC(12,2) NOT NULL,
    lot_number      VARCHAR(80),
    expiry_date     DATE
);

-- ---------------------------------------------------------------------
-- 5. WAREHOUSES & LOCATIONS
-- ---------------------------------------------------------------------
CREATE TABLE warehouses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(120) NOT NULL,
    code            VARCHAR(40) UNIQUE NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE warehouse_locations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id    UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    zone            VARCHAR(40),
    aisle           VARCHAR(40),
    shelf           VARCHAR(40),
    bin             VARCHAR(40),
    UNIQUE (warehouse_id, zone, aisle, shelf, bin)
);

-- ---------------------------------------------------------------------
-- 6. INVENTORY BATCHES  (each purchase batch stays independent)
-- ---------------------------------------------------------------------
CREATE TABLE inventory_batches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id),
    variant_id      UUID REFERENCES product_variants(id),
    supplier_id     UUID REFERENCES suppliers(id),
    po_item_id      UUID REFERENCES purchase_invoice_items(id),
    lot_number      VARCHAR(80),
    expiry_date     DATE,                               -- NULL if not perishable
    purchase_cost   NUMERIC(12,2) NOT NULL,             -- cost of THIS batch
    qty_received    INT NOT NULL CHECK (qty_received >= 0),
    entry_date      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- quantity of a given batch physically sitting in a given location
CREATE TABLE batch_stock (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
    location_id     UUID NOT NULL REFERENCES warehouse_locations(id),
    quantity        INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    UNIQUE (batch_id, location_id)
);

-- ---------------------------------------------------------------------
-- 7. STOCK MOVEMENTS  (every change is a logged movement)
-- ---------------------------------------------------------------------
CREATE TABLE stock_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        UUID NOT NULL REFERENCES inventory_batches(id),
    type            VARCHAR(20) NOT NULL,   -- purchase | sale | transfer | return_in | reserve | release | adjustment
    from_location   UUID REFERENCES warehouse_locations(id),
    to_location     UUID REFERENCES warehouse_locations(id),
    quantity        INT NOT NULL,           -- signed or absolute per `type`; app enforces
    reference       VARCHAR(120),           -- order #, invoice #, return #, adjustment note
    user_id         UUID REFERENCES users(id),
    return_item_id  UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 8. CART & WISHLIST
-- ---------------------------------------------------------------------
CREATE TABLE carts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    coupon_id       UUID,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cart_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id         UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id),
    variant_id      UUID REFERENCES product_variants(id),
    quantity        INT NOT NULL CHECK (quantity > 0),
    unit_price      NUMERIC(12,2) NOT NULL
);

CREATE TABLE wishlist_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, product_id)
);

-- ---------------------------------------------------------------------
-- 9. COUPONS
-- ---------------------------------------------------------------------
CREATE TABLE coupons (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(60) UNIQUE NOT NULL,
    type            VARCHAR(20) NOT NULL,   -- percentage | fixed
    value           NUMERIC(12,2) NOT NULL,
    usage_limit     INT,
    used_count      INT NOT NULL DEFAULT 0,
    expires_at      TIMESTAMPTZ
);

ALTER TABLE carts ADD CONSTRAINT carts_coupon_id_fkey
    FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 10. ORDERS
-- ---------------------------------------------------------------------
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    address_id      UUID REFERENCES addresses(id) ON DELETE SET NULL,
    delivery_id     UUID UNIQUE,
    coupon_id       UUID REFERENCES coupons(id),
    order_number    VARCHAR(40) UNIQUE NOT NULL,
    idempotency_key VARCHAR(128),
    idempotency_fingerprint VARCHAR(64),
    status          VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','confirmed','preparing','ready_for_dispatch',
                          'dispatched','delivered','failed','cancelled',
                          'return_requested','returned')),
    payment_method  VARCHAR(20) NOT NULL DEFAULT 'cod',
    subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
    delivery_fee    NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount        NUMERIC(12,2) NOT NULL DEFAULT 0,
    total           NUMERIC(12,2) NOT NULL DEFAULT 0,
    delivery_contact_phone VARCHAR(32) NOT NULL,
    delivery_address_label VARCHAR(80),
    delivery_city          VARCHAR(80) NOT NULL,
    delivery_area          VARCHAR(120),
    delivery_street        VARCHAR(160),
    delivery_details       TEXT,
    delivery_lat           DOUBLE PRECISION,
    delivery_lng           DOUBLE PRECISION,
    placed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX orders_user_id_idempotency_key_key ON orders(user_id, idempotency_key);

CREATE TABLE order_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id),
    variant_id      UUID REFERENCES product_variants(id),
    product_name_ar VARCHAR(200) NOT NULL,              -- snapshot captured at order creation
    product_name_en VARCHAR(200) NOT NULL,              -- snapshot captured at order creation
    image_url       VARCHAR(400),                       -- primary image snapshot; NULL when absent
    quantity        INT NOT NULL CHECK (quantity > 0),
    unit_price      NUMERIC(12,2) NOT NULL,
    line_total      NUMERIC(12,2) NOT NULL,
    reviewed        BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE order_status_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL
        CHECK (status IN ('pending','confirmed','preparing','ready_for_dispatch',
                          'dispatched','delivered','failed','cancelled',
                          'return_requested','returned')),
    note TEXT,
    at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_status_events_order_id_at_idx ON order_status_events(order_id, at);

CREATE TABLE simple_stock_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    quantity INT NOT NULL CHECK (quantity > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'held',
    deducted_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    CHECK (
      (status = 'held' AND deducted_at IS NULL AND released_at IS NULL) OR
      (status = 'deducted' AND deducted_at IS NOT NULL AND released_at IS NULL) OR
      (status = 'released' AND deducted_at IS NULL AND released_at IS NOT NULL)
    )
);
CREATE INDEX simple_stock_holds_product_id_variant_id_status_idx
    ON simple_stock_holds(product_id, variant_id, status);

CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    method          VARCHAR(20) NOT NULL DEFAULT 'cod',
    status          VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | paid | refunded | failed
    amount          NUMERIC(12,2) NOT NULL,
    paid_at         TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- 11. STOCK RESERVATIONS & PICKING
-- ---------------------------------------------------------------------
CREATE TABLE stock_reservations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id   UUID REFERENCES order_items(id) ON DELETE CASCADE,
    batch_id        UUID NOT NULL REFERENCES inventory_batches(id),
    location_id     UUID NOT NULL REFERENCES warehouse_locations(id),
    quantity        INT NOT NULL CHECK (quantity > 0),
    status          VARCHAR(20) NOT NULL DEFAULT 'reserved', -- reserved | released | fulfilled
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pick_lists (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    assigned_to     UUID REFERENCES users(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'open', -- open | picking | picked | closed
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pick_list_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pick_list_id    UUID NOT NULL REFERENCES pick_lists(id) ON DELETE CASCADE,
    order_item_id   UUID REFERENCES order_items(id),
    batch_id        UUID NOT NULL REFERENCES inventory_batches(id),
    location_id     UUID NOT NULL REFERENCES warehouse_locations(id),
    quantity        INT NOT NULL CHECK (quantity > 0),
    picked          BOOLEAN NOT NULL DEFAULT FALSE
);

-- ---------------------------------------------------------------------
-- 12. DELIVERIES
-- ---------------------------------------------------------------------
CREATE TABLE deliveries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    agent_id        UUID REFERENCES users(id),
    status          VARCHAR(30) NOT NULL DEFAULT 'assigned', -- assigned | out_for_delivery | delivered | failed | returned
    delivery_fee    NUMERIC(12,2) NOT NULL DEFAULT 0,
    dispatched_at   TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ
);

ALTER TABLE orders
    ADD CONSTRAINT orders_delivery_id_fkey
    FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 13. RETURNS (partial returns allowed; condition drives restock)
-- ---------------------------------------------------------------------
CREATE TABLE returns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    type            VARCHAR(20) NOT NULL DEFAULT 'return',   -- return | exchange
    status          VARCHAR(30) NOT NULL DEFAULT 'requested',-- requested | approved | partially_approved | rejected | completed
    reason          TEXT,
    expected_refund NUMERIC(12,2) NOT NULL DEFAULT 0,
    refund_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
    reviewed_by     UUID REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE return_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id       UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
    order_item_id   UUID NOT NULL REFERENCES order_items(id),
    quantity        INT NOT NULL CHECK (quantity > 0),       -- may be < ordered qty (partial return)
    approved_quantity INT NOT NULL DEFAULT 0 CHECK (approved_quantity >= 0 AND approved_quantity <= quantity),
    customer_reason TEXT NOT NULL,
    unit_price      NUMERIC(12,2) NOT NULL,
    condition       VARCHAR(20),                             -- sellable | opened | damaged
    restock         BOOLEAN NOT NULL DEFAULT FALSE,          -- only sellable normally re-enters stock
    batch_id        UUID REFERENCES inventory_batches(id),   -- batch it is restocked into, if any
    UNIQUE (return_id, order_item_id)
);

ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_return_item_id_fkey
    FOREIGN KEY (return_item_id) REFERENCES return_items(id);
CREATE INDEX idx_movements_return_item ON stock_movements(return_item_id);

-- COD refunds are recorded obligations; no gateway charge is reversed.
CREATE TABLE refund_ledger (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id),
    return_id       UUID NOT NULL UNIQUE REFERENCES returns(id),
    amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    status          VARCHAR(20) NOT NULL DEFAULT 'obligation' CHECK (status = 'obligation'),
    reason          TEXT NOT NULL,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refund_ledger_order ON refund_ledger(order_id);

-- ---------------------------------------------------------------------
-- 14. RATINGS  (product review vs delivery rating kept separate)
-- ---------------------------------------------------------------------
CREATE TABLE product_reviews (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id         UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id            UUID NOT NULL REFERENCES users(id),
    order_item_id      UUID REFERENCES order_items(id),      -- ties review to a real purchase
    rating             INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment            TEXT,
    verified_purchase  BOOLEAN NOT NULL DEFAULT FALSE,
    status             VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | published | rejected
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    moderation_reason  VARCHAR(500),
    moderated_by       UUID REFERENCES users(id),
    moderated_at       TIMESTAMPTZ,
    CONSTRAINT product_reviews_status_check CHECK (status IN ('pending', 'published', 'rejected')),
    UNIQUE (order_item_id, user_id),
    UNIQUE (order_item_id)
);

CREATE TABLE delivery_ratings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id     UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    agent_id        UUID REFERENCES users(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    stars           INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
    comment         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (delivery_id, user_id),
    UNIQUE (delivery_id)
);

-- ---------------------------------------------------------------------
-- 15. LOYALTY POINTS  (ledger from the start)
-- ---------------------------------------------------------------------
CREATE TABLE loyalty_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE loyalty_ledger (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
    order_id        UUID REFERENCES orders(id),
    return_id       UUID REFERENCES returns(id),
    type            VARCHAR(20) NOT NULL,   -- earn | redeem | adjust | expire
    reason          VARCHAR(120) NOT NULL,
    points          INT NOT NULL,           -- +earn / -redeem
    note            VARCHAR(255),
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT loyalty_ledger_type_points_check CHECK (
        (type = 'earn' AND points > 0 AND order_id IS NOT NULL)
        OR (type = 'redeem' AND points < 0)
        OR (type = 'adjust' AND points <> 0)
        OR (type = 'expire' AND points < 0)
    )
);

CREATE UNIQUE INDEX loyalty_earn_order_once ON loyalty_ledger(order_id) WHERE type = 'earn';
CREATE FUNCTION loyalty_ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'loyalty ledger entries are append-only';
END;
$$;
CREATE TRIGGER loyalty_ledger_no_update_delete
    BEFORE UPDATE OR DELETE ON loyalty_ledger
    FOR EACH ROW EXECUTE FUNCTION loyalty_ledger_immutable();

-- ---------------------------------------------------------------------
-- 16. AUDIT TRAIL  (sensitive operations)
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id        UUID REFERENCES users(id),
    action          VARCHAR(80) NOT NULL,   -- created | updated | deleted | adjusted | price_changed | ...
    entity_type     VARCHAR(80) NOT NULL,   -- product | inventory_batch | order | return | role | ...
    entity_id       UUID,
    before          JSONB,
    after           JSONB,
    ip              VARCHAR(64),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- INDEXES (performance-critical paths)
-- ---------------------------------------------------------------------
CREATE INDEX idx_products_category      ON products(category_id);
CREATE INDEX idx_products_status        ON products(status);
-- Supports GET /products?on_sale=true, which scans only discounted rows.
CREATE INDEX idx_products_discount_window ON products(discount_starts_at, discount_ends_at)
    WHERE discount_type IS NOT NULL;
CREATE UNIQUE INDEX idx_categories_slug ON categories(slug);
CREATE INDEX idx_banners_active_sort    ON banners(is_active, sort_order);
CREATE INDEX idx_batches_product        ON inventory_batches(product_id);
CREATE INDEX idx_batches_expiry         ON inventory_batches(expiry_date);      -- FEFO
CREATE INDEX idx_batch_stock_batch      ON batch_stock(batch_id);
CREATE INDEX idx_batch_stock_location   ON batch_stock(location_id);
CREATE INDEX idx_movements_batch        ON stock_movements(batch_id);
CREATE INDEX idx_movements_type         ON stock_movements(type);
CREATE INDEX idx_reservations_order     ON stock_reservations(order_id);
CREATE INDEX idx_device_tokens_user     ON device_tokens(user_id);
CREATE INDEX idx_notification_events_pending ON notification_events(enqueued_at, created_at);
CREATE INDEX idx_notification_logs_user_history ON notification_logs(user_id, created_at DESC, id DESC);
CREATE UNIQUE INDEX idx_addresses_one_default_per_user ON addresses(user_id)
    WHERE is_default;
CREATE INDEX idx_orders_user            ON orders(user_id);
CREATE INDEX idx_orders_status          ON orders(status);
CREATE INDEX idx_orders_admin_stable ON orders(placed_at DESC, id DESC);
CREATE INDEX idx_orders_admin_status_stable ON orders(status, placed_at DESC, id DESC);
CREATE INDEX idx_orders_admin_customer_stable ON orders(user_id, placed_at DESC, id DESC);
CREATE INDEX idx_order_items_order      ON order_items(order_id);
CREATE INDEX idx_returns_order          ON returns(order_id);
CREATE INDEX idx_loyalty_ledger_account ON loyalty_ledger(account_id);
CREATE INDEX idx_loyalty_ledger_return ON loyalty_ledger(return_id);
CREATE INDEX idx_audit_entity           ON audit_logs(entity_type, entity_id);

-- =====================================================================
-- END OF SCHEMA — Shubayr v2.0
-- =====================================================================
