-- =====================================================================
-- SHUBAYR — Authoritative Database Schema (PostgreSQL)
-- Contract 7.0 — incorporates the team review (suppliers, batches,
-- warehouses/locations, stock movements, FEFO, reservations, picking,
-- returns, loyalty, split ratings, RBAC, audit trail, white-label).
--
-- Bootstrap/reference for clean databases. Prisma Migrate files under
-- backend/prisma/migrations are the production upgrade path. Keep this file,
-- schema.prisma, migrations, and OpenAPI synchronized in the same PR.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- Financial policy: monetary values use exact NUMERIC storage with an explicit
-- currency code. Customer values round half away from zero at the currency's
-- display precision (IQD 0, USD 2); costs and FX retain higher precision.

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
-- 1. ACCESS MODEL V2 — APP ROLES, ADMIN PERMISSIONS, AND PRESETS
-- ---------------------------------------------------------------------
CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(80) UNIQUE NOT NULL,    -- customer, delivery_agent, order_monitor
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

CREATE TABLE permission_presets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(80) UNIQUE NOT NULL,
    description     VARCHAR(255),
    is_system       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE preset_permissions (
    preset_id       UUID NOT NULL REFERENCES permission_presets(id) ON DELETE CASCADE,
    permission_id   UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (preset_id, permission_id)
);

-- ---------------------------------------------------------------------
-- 2. USERS & ADDRESSES
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id         UUID REFERENCES roles(id),
    name            VARCHAR(120),
    phone           VARCHAR(32) UNIQUE,
    username        VARCHAR(80) UNIQUE,
    email           VARCHAR(160),
    password_hash   VARCHAR(255),
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    session_version INTEGER NOT NULL DEFAULT 1,
    permission_version INTEGER NOT NULL DEFAULT 1,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_identity_check CHECK (phone IS NOT NULL OR username IS NOT NULL),
    CONSTRAINT users_username_format_check CHECK (username IS NULL OR username ~ '^[a-z][a-z0-9._-]{2,79}$')
);

CREATE TABLE user_presets (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    preset_id       UUID NOT NULL REFERENCES permission_presets(id) ON DELETE CASCADE,
    assigned_by     UUID NOT NULL REFERENCES users(id),
    reason          VARCHAR(500) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, preset_id)
);

CREATE TABLE user_permission_grants (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id   UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_by      UUID NOT NULL REFERENCES users(id),
    reason          VARCHAR(500) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, permission_id)
);

CREATE TABLE work_profiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(120) NOT NULL,
    app_role        VARCHAR(32) NOT NULL CHECK (app_role IN ('delivery_agent', 'order_monitor')),
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
  surface VARCHAR(16) NOT NULL CHECK (surface IN ('admin', 'app')),
  client VARCHAR(20) CHECK (client IS NULL OR client IN ('mobile', 'web_store')),
  session_version INTEGER NOT NULL,
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
       'delivery_failed','return_update','loyalty_points_earned','review_moderated','promo',
       'new_order','order_cancelled','order_rejected','delivery_assigned')),
    CONSTRAINT notification_channel_preferences_channel_check CHECK (channel IN ('push','sms')),
    CONSTRAINT notification_channel_preferences_critical_check
      CHECK (NOT (type = 'order_confirmed' AND channel = 'sms' AND enabled = false))
);

CREATE TABLE notification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_key VARCHAR(160) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(40) NOT NULL,
    target_role VARCHAR(32) NOT NULL CHECK (target_role IN ('customer','delivery_agent','order_monitor','staff')),
    entity_type VARCHAR(40) NOT NULL,
    entity_id UUID NOT NULL,
    title_ar VARCHAR(200) NOT NULL,
    body_ar TEXT NOT NULL,
    title_en VARCHAR(200) NOT NULL,
    body_en TEXT NOT NULL,
    deep_link VARCHAR(500) NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    enqueued_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    CONSTRAINT notification_events_event_key_user_id_key UNIQUE (event_key, user_id),
    CONSTRAINT notification_events_type_check CHECK (type IN
      ('order_placed','order_confirmed','order_status_changed','out_for_delivery','delivered',
       'delivery_failed','return_update','loyalty_points_earned','review_moderated','promo',
       'new_order','order_cancelled','order_rejected','delivery_assigned'))
);

CREATE TABLE notification_stream_events (
    sequence BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_id UUID REFERENCES notification_events(id) ON DELETE CASCADE,
    event VARCHAR(40) NOT NULL CHECK (event IN ('notification.created','notification.read','unread.count')),
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
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
                          'dispatched','delivered','failed','rejected','cancelled',
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
                          'dispatched','delivered','failed','rejected','cancelled',
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
    reason          VARCHAR(500),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 17. FINANCIAL CORE (contract v7.0)
-- Synchronized from Prisma migration 20260928150818_financial_core.
-- ---------------------------------------------------------------------
-- AlterTable
ALTER TABLE "cart_items" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "coupons" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "value" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "delivery_fee" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "inventory_batches" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "purchase_cost" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(20,6),
ALTER COLUMN "line_total" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "accounting_date" DATE NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ADD COLUMN     "document_date" DATE NOT NULL DEFAULT CURRENT_DATE,
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(20,6),
ALTER COLUMN "delivery_fee" SET DATA TYPE DECIMAL(20,6),
ALTER COLUMN "discount" SET DATA TYPE DECIMAL(20,6),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "accounting_date" DATE NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ADD COLUMN     "document_date" DATE NOT NULL DEFAULT CURRENT_DATE,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "price_delta" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "price" SET DATA TYPE DECIMAL(20,6),
ALTER COLUMN "discount_value" SET DATA TYPE DECIMAL(20,6),
ALTER COLUMN "floor_price" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "purchase_invoice_items" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "unit_cost" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "purchase_invoices" ADD COLUMN     "accounting_date" DATE NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ADD COLUMN     "document_date" DATE NOT NULL DEFAULT CURRENT_DATE,
ALTER COLUMN "total_cost" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "refund_ledger" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "return_items" ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "returns" ADD COLUMN     "accounting_date" DATE NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN     "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
ADD COLUMN     "document_date" DATE NOT NULL DEFAULT CURRENT_DATE,
ALTER COLUMN "expected_refund" SET DATA TYPE DECIMAL(20,6),
ALTER COLUMN "refund_amount" SET DATA TYPE DECIMAL(20,6);

-- Existing commerce rows become IQD rows. Normalize customer-facing values to
-- IQD's zero-decimal display precision while preserving higher-precision costs.
UPDATE "products" SET
  "price" = round("price"),
  "floor_price" = CASE WHEN "floor_price" IS NULL THEN NULL ELSE round("floor_price") END,
  "discount_value" = CASE
    WHEN "discount_type" = 'amount' AND "discount_value" IS NOT NULL THEN round("discount_value")
    ELSE "discount_value"
  END;
UPDATE "product_variants" SET "price_delta" = round("price_delta");
UPDATE "cart_items" SET "unit_price" = round("unit_price");
UPDATE "coupons" SET "value" = round("value") WHERE "type" = 'fixed';
UPDATE "orders" SET
  "subtotal" = round("subtotal"), "delivery_fee" = round("delivery_fee"),
  "discount" = round("discount"), "total" = round("total");
UPDATE "order_items" SET "unit_price" = round("unit_price"), "line_total" = round("line_total");
UPDATE "payments" SET "amount" = round("amount");
UPDATE "deliveries" SET "delivery_fee" = round("delivery_fee");
UPDATE "returns" SET "expected_refund" = round("expected_refund"), "refund_amount" = round("refund_amount");
UPDATE "return_items" SET "unit_price" = round("unit_price");
UPDATE "refund_ledger" SET "amount" = round("amount");

-- CreateTable
CREATE TABLE "currencies" (
    "code" CHAR(3) NOT NULL,
    "name_ar" VARCHAR(120) NOT NULL,
    "name_en" VARCHAR(120) NOT NULL,
    "symbol" VARCHAR(20) NOT NULL,
    "display_precision" INTEGER NOT NULL,
    "is_base" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "currency_code" CHAR(3) NOT NULL,
    "rate" DECIMAL(24,10) NOT NULL,
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "set_by" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "document_type" VARCHAR(40) NOT NULL,
    "year" INTEGER NOT NULL,
    "prefix" VARCHAR(12) NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("document_type","year")
);

-- CreateTable
CREATE TABLE "operation_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "operation_id" VARCHAR(128) NOT NULL,
    "endpoint" VARCHAR(160) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'processing',
    "response_status" INTEGER,
    "response" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "operation_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "document_type" VARCHAR(60) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(40) NOT NULL,
    "name_ar" VARCHAR(160) NOT NULL,
    "name_en" VARCHAR(160) NOT NULL,
    "type" VARCHAR(24) NOT NULL,
    "normal_side" VARCHAR(6) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_number" VARCHAR(40) NOT NULL,
    "source_type" VARCHAR(60) NOT NULL,
    "source_id" UUID NOT NULL,
    "event" VARCHAR(60) NOT NULL,
    "document_date" DATE NOT NULL,
    "accounting_date" DATE NOT NULL,
    "description" VARCHAR(500),
    "created_by" UUID NOT NULL,
    "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reverses_id" UUID,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "debit_base" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "credit_base" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "currency_code" CHAR(3) NOT NULL,
    "original_amount" DECIMAL(20,6) NOT NULL,
    "exchange_rate" DECIMAL(24,10) NOT NULL,
    "memo" VARCHAR(500),

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(160) NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "ledger_account_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_opening_balances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_number" VARCHAR(40) NOT NULL,
    "cash_account_id" UUID NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "document_date" DATE NOT NULL,
    "accounting_date" DATE NOT NULL,
    "backdate_reason" VARCHAR(500),
    "created_by" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_opening_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_number" VARCHAR(40) NOT NULL,
    "from_account_id" UUID NOT NULL,
    "to_account_id" UUID NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "document_date" DATE NOT NULL,
    "accounting_date" DATE NOT NULL,
    "backdate_reason" VARCHAR(500),
    "reason" VARCHAR(500) NOT NULL,
    "created_by" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_periods" (
    "month" DATE NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'open',
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "reopened_at" TIMESTAMPTZ(6),
    "reopened_by" UUID,
    "reopen_reason" VARCHAR(500),

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("month")
);

-- CreateTable
CREATE TABLE "period_closes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "period_month" DATE NOT NULL,
    "sequence" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "differences" JSONB,
    "reason" VARCHAR(500),
    "closed_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "period_closes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_hours" (
    "weekday" INTEGER NOT NULL,
    "opens_at" CHAR(5),
    "closes_at" CHAR(5),
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_hours_pkey" PRIMARY KEY ("weekday")
);

-- CreateTable
CREATE TABLE "closed_days" (
    "date" DATE NOT NULL,
    "reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "closed_days_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "protection_thresholds" (
    "key" VARCHAR(40) NOT NULL,
    "percent" DECIMAL(7,2) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protection_thresholds_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "idx_exchange_rates_applicable" ON "exchange_rates"("currency_code", "effective_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "operation_records_user_id_operation_id_key" ON "operation_records"("user_id", "operation_id");

-- CreateIndex
CREATE INDEX "idx_document_drafts_user" ON "document_drafts"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "document_drafts_user_id_document_type_key" ON "document_drafts"("user_id", "document_type");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_code_key" ON "ledger_accounts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_document_number_key" ON "journal_entries"("document_number");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reverses_id_key" ON "journal_entries"("reverses_id");

-- CreateIndex
CREATE INDEX "idx_journal_entries_accounting_date" ON "journal_entries"("accounting_date", "id");

-- CreateIndex
CREATE INDEX "idx_journal_entries_source" ON "journal_entries"("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_source_event_key" ON "journal_entries"("source_type", "source_id", "event");

-- CreateIndex
CREATE INDEX "idx_journal_lines_account" ON "journal_lines"("account_id", "entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_accounts_ledger_account_id_key" ON "cash_accounts"("ledger_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_opening_balances_document_number_key" ON "cash_opening_balances"("document_number");

-- CreateIndex
CREATE UNIQUE INDEX "cash_opening_balances_journal_entry_id_key" ON "cash_opening_balances"("journal_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_transfers_document_number_key" ON "cash_transfers"("document_number");

-- CreateIndex
CREATE UNIQUE INDEX "cash_transfers_journal_entry_id_key" ON "cash_transfers"("journal_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "period_closes_period_sequence_key" ON "period_closes"("period_month", "sequence");

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reverses_id_fkey" FOREIGN KEY ("reverses_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_ledger_account_id_fkey" FOREIGN KEY ("ledger_account_id") REFERENCES "ledger_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_opening_balances" ADD CONSTRAINT "cash_opening_balances_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_opening_balances" ADD CONSTRAINT "cash_opening_balances_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "cash_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "cash_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "period_closes" ADD CONSTRAINT "period_closes_period_month_fkey" FOREIGN KEY ("period_month") REFERENCES "accounting_periods"("month") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Exact financial-domain invariants that Prisma cannot express.
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_code_iso_check" CHECK ("code" ~ '^[A-Z]{3}$');
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_precision_check" CHECK ("display_precision" BETWEEN 0 AND 6);
CREATE UNIQUE INDEX "currencies_one_base_key" ON "currencies" ((TRUE)) WHERE "is_base";
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_positive_check" CHECK ("rate" > 0);
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_one_side_check" CHECK (
  ("debit_base" > 0 AND "credit_base" = 0) OR
  ("credit_base" > 0 AND "debit_base" = 0)
);
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_original_positive_check" CHECK ("original_amount" > 0 AND "exchange_rate" > 0);
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_type_check" CHECK ("type" IN ('asset','liability','equity','income','contra_revenue','expense'));
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_normal_side_check" CHECK ("normal_side" IN ('debit','credit'));
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_kind_check" CHECK ("kind" IN ('cash','bank'));
ALTER TABLE "cash_opening_balances" ADD CONSTRAINT "cash_opening_balances_positive_check" CHECK ("amount" > 0);
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_positive_check" CHECK ("amount" > 0);
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_distinct_accounts_check" CHECK ("from_account_id" <> "to_account_id");
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_status_check" CHECK ("status" IN ('open','closed'));
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6);
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_pair_check" CHECK (
  ("is_closed" AND "opens_at" IS NULL AND "closes_at" IS NULL) OR
  (NOT "is_closed" AND "opens_at" ~ '^[0-2][0-9]:[0-5][0-9]$' AND "closes_at" ~ '^[0-2][0-9]:[0-5][0-9]$')
);
ALTER TABLE "protection_thresholds" ADD CONSTRAINT "protection_thresholds_percent_check" CHECK ("percent" >= 0);

CREATE FUNCTION "assert_journal_balanced"() RETURNS trigger AS $$
DECLARE
  affected_entry UUID;
  debit_total NUMERIC(20,4);
  credit_total NUMERIC(20,4);
  line_count INTEGER;
BEGIN
  affected_entry := COALESCE(NEW.entry_id, OLD.entry_id);
  SELECT COALESCE(SUM(debit_base), 0), COALESCE(SUM(credit_base), 0), COUNT(*)
    INTO debit_total, credit_total, line_count
    FROM journal_lines WHERE entry_id = affected_entry;
  IF line_count < 2 OR debit_total <> credit_total THEN
    RAISE EXCEPTION 'journal entry % is not balanced', affected_entry USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "journal_lines_balance_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "journal_lines"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_journal_balanced"();

CREATE FUNCTION "protect_posted_journal"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'posted journal records are immutable' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "journal_entries_immutable_trigger"
BEFORE UPDATE OR DELETE ON "journal_entries"
FOR EACH ROW EXECUTE FUNCTION "protect_posted_journal"();

CREATE TRIGGER "journal_lines_immutable_trigger"
BEFORE UPDATE OR DELETE ON "journal_lines"
FOR EACH ROW EXECUTE FUNCTION "protect_posted_journal"();

CREATE FUNCTION "reject_closed_period_posting"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM accounting_periods
    WHERE month = date_trunc('month', NEW.accounting_date)::date
      AND status = 'closed'
  ) THEN
    RAISE EXCEPTION 'accounting period is closed' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "journal_entries_open_period_trigger"
BEFORE INSERT ON "journal_entries"
FOR EACH ROW EXECUTE FUNCTION "reject_closed_period_posting"();

CREATE FUNCTION "lock_base_currency_after_movement"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM journal_entries LIMIT 1) AND
     (TG_OP = 'DELETE' OR OLD.is_base IS DISTINCT FROM NEW.is_base OR OLD.code IS DISTINCT FROM NEW.code) THEN
    RAISE EXCEPTION 'base currency is locked after the first financial movement' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "currencies_base_lock_trigger"
BEFORE UPDATE OR DELETE ON "currencies"
FOR EACH ROW WHEN (OLD.is_base)
EXECUTE FUNCTION "lock_base_currency_after_movement"();

-- Initial currency registry, settings and chart of accounts.
INSERT INTO "currencies" ("code","name_ar","name_en","symbol","display_precision","is_base","enabled") VALUES
  ('IQD','دينار عراقي','Iraqi Dinar','د.ع',0,TRUE,TRUE),
  ('USD','دولار أمريكي','US Dollar','US$',2,FALSE,TRUE);

INSERT INTO "ledger_accounts" ("code","name_ar","name_en","type","normal_side") VALUES
  ('1000','المخزون','Inventory','asset','debit'),
  ('1010','بضاعة في عهدة التوصيل','Goods in delivery custody','asset','debit'),
  ('1020','نقد في عهدة التوصيل','Cash in delivery custody','asset','debit'),
  ('1030','تحصيل بانتظار التأكيد','Collection awaiting confirmation','asset','debit'),
  ('1040','استثناءات التحصيل','Collection exceptions under review','asset','debit'),
  ('1050','النقد والبنوك','Cash and bank accounts','asset','debit'),
  ('2000','ذمم الموردين','Supplier payable','liability','credit'),
  ('2010','ذمم الشحن','Freight payable','liability','credit'),
  ('2020','ذمم الأجور والنقل','Wages and fares payable','liability','credit'),
  ('2030','مبالغ مستردة مستحقة','Refunds payable','liability','credit'),
  ('2040','مصاريف مستحقة','Expense payable','liability','credit'),
  ('3000','حقوق المالك','Owner equity','equity','credit'),
  ('3010','مسحوبات المالك','Owner drawings','equity','debit'),
  ('4000','إيراد المبيعات','Sales revenue','income','credit'),
  ('4010','إيراد أجور التوصيل','Delivery-fee revenue','income','credit'),
  ('4020','أرباح فروق الصرف','FX gain','income','credit'),
  ('4100','مردودات المبيعات','Sales returns','contra_revenue','debit'),
  ('4110','مردود أجور التوصيل','Delivery-fee refunds','contra_revenue','debit'),
  ('5000','كلفة البضاعة المباعة','Cost of goods sold','expense','debit'),
  ('5010','خسارة المخزون','Inventory loss','expense','debit'),
  ('5011','مكاسب المخزون','Inventory gain','income','credit'),
  ('5020','خسائر التحصيل','Collection losses','expense','debit'),
  ('5030','خسائر فروق الصرف','FX loss','expense','debit'),
  ('5040','أجور التوصيل','Delivery wages','expense','debit'),
  ('5050','مصاريف تشغيلية','Operating expenses','expense','debit');

INSERT INTO "store_settings" ("key","value") VALUES
  ('timezone','Asia/Baghdad'),
  ('delivery_fee','5000'),
  ('acceptance_alert_timeout_minutes','15'),
  ('auto_cancel_enabled','false'),
  ('auto_cancel_timeout_minutes',NULL),
  ('auto_cancel_warning_minutes',NULL),
  ('default_low_stock_threshold','5'),
  ('backdating_window_days','90'),
  ('markup_alert_percent',NULL)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "protection_thresholds" ("key","percent") VALUES
  ('cost',50),('price',50),('quantity',50),('exchange_rate',50)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "business_hours" ("weekday","opens_at","closes_at","is_closed") VALUES
  (0,'09:00','17:00',FALSE),(1,'09:00','17:00',FALSE),(2,'09:00','17:00',FALSE),
  (3,'09:00','17:00',FALSE),(4,'09:00','17:00',FALSE),(5,NULL,NULL,TRUE),(6,'09:00','17:00',FALSE)
ON CONFLICT ("weekday") DO NOTHING;

INSERT INTO "permissions" ("key","group","description") VALUES
  ('fx_rates.update','finance','Update exchange rates'),
  ('ledger.view','finance','View ledger and trial balance'),
  ('ledger.reverse','finance','Reverse posted ledger entries'),
  ('cash_accounts.manage','finance','Manage cash and bank accounts'),
  ('period.reopen','accounting','Reopen closed accounting periods'),
  ('backdate.approve','controls','Approve documents outside the back-dating window')
ON CONFLICT ("key") DO UPDATE SET "group"=EXCLUDED."group", "description"=EXCLUDED."description";

INSERT INTO "preset_permissions" ("preset_id","permission_id")
SELECT pp.id, p.id FROM "permission_presets" pp CROSS JOIN "permissions" p
WHERE pp.name='super_admin' AND p.key IN ('fx_rates.update','ledger.view','ledger.reverse','cash_accounts.manage','period.reopen','backdate.approve')
ON CONFLICT DO NOTHING;

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
CREATE INDEX idx_notification_events_inbox ON notification_events(user_id, read_at, created_at DESC, id DESC);
CREATE INDEX idx_notification_stream_events_user_sequence ON notification_stream_events(user_id, sequence);
CREATE INDEX idx_notification_stream_events_pending ON notification_stream_events(published_at, sequence);
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
-- CATALOG V2 (contract 8.0; mirrored from the deploy migration)
-- =====================================================================
-- Catalog v2: two-level categories, independent brands, SKU pricing and
-- three-decimal quantities. Existing product-level/base stock is assigned a
-- real generated SKU so historical rows keep their identity.

CREATE TABLE "brands" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name_en" VARCHAR(120) NOT NULL,
  "name_ar" VARCHAR(120) NOT NULL,
  "slug" VARCHAR(140) NOT NULL,
  "logo_url" TEXT,
  "is_visible" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "brands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "brands_slug_key" UNIQUE ("slug")
);
CREATE INDEX "idx_brands_public" ON "brands"("is_visible", "sort_order", "id");

ALTER TABLE "products"
  ADD COLUMN "brand_id" UUID,
  ADD COLUMN "published_at" TIMESTAMPTZ(6),
  ADD COLUMN "price_approved_at" TIMESTAMPTZ(6);
UPDATE "products"
SET "published_at" = CASE WHEN "status" = 'active' THEN CURRENT_TIMESTAMP ELSE NULL END,
    "price_approved_at" = CURRENT_TIMESTAMP;
ALTER TABLE "products"
  DROP CONSTRAINT IF EXISTS "products_negotiation_values_check",
  DROP COLUMN "is_negotiable",
  DROP COLUMN "floor_price",
  DROP COLUMN "points_price";
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey"
  FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
CREATE INDEX "idx_products_brand" ON "products"("brand_id");

ALTER TABLE "product_variants"
  ADD COLUMN "base_unit" VARCHAR(32) NOT NULL DEFAULT 'piece',
  ADD COLUMN "whole_units_only" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "selling_price" DECIMAL(20,6),
  ADD COLUMN "low_stock_threshold" DECIMAL(20,3),
  ADD COLUMN "pricing_mode" VARCHAR(16) NOT NULL DEFAULT 'fixed',
  ADD COLUMN "reference_currency_code" CHAR(3),
  ADD COLUMN "reference_price" DECIMAL(20,6),
  ADD COLUMN "published_price" DECIMAL(20,6),
  ADD COLUMN "price_approved_at" TIMESTAMPTZ(6),
  ADD COLUMN "price_version_id" UUID,
  ADD COLUMN "awaiting_rate_id" UUID,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "product_variants" v
SET "selling_price" = CASE
      WHEN v."price_delta" = 0 THEN NULL
      ELSE p."price" + v."price_delta"
    END,
    "price_approved_at" = CURRENT_TIMESTAMP
FROM "products" p
WHERE p."id" = v."product_id";

CREATE TEMP TABLE "catalog_v2_base_variants" (
  "product_id" UUID PRIMARY KEY,
  "variant_id" UUID NOT NULL
);
INSERT INTO "catalog_v2_base_variants" ("product_id", "variant_id")
SELECT "id", gen_random_uuid() FROM "products";
INSERT INTO "product_variants" (
  "id", "product_id", "sku", "attributes", "price_delta", "currency_code",
  "base_unit", "whole_units_only", "pricing_mode", "price_approved_at", "updated_at"
)
SELECT m."variant_id", p."id", 'BASE-' || upper(substr(replace(m."variant_id"::text, '-', ''), 1, 24)),
       jsonb_build_object('legacy_base', true), 0, p."currency_code", 'piece', true,
       'fixed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "products" p
JOIN "catalog_v2_base_variants" m ON m."product_id" = p."id";

UPDATE "purchase_invoice_items" x SET "variant_id" = m."variant_id"
FROM "catalog_v2_base_variants" m WHERE x."variant_id" IS NULL AND x."product_id" = m."product_id";
UPDATE "inventory_batches" x SET "variant_id" = m."variant_id"
FROM "catalog_v2_base_variants" m WHERE x."variant_id" IS NULL AND x."product_id" = m."product_id";
UPDATE "cart_items" x SET "variant_id" = m."variant_id"
FROM "catalog_v2_base_variants" m WHERE x."variant_id" IS NULL AND x."product_id" = m."product_id";
UPDATE "order_items" x SET "variant_id" = m."variant_id"
FROM "catalog_v2_base_variants" m WHERE x."variant_id" IS NULL AND x."product_id" = m."product_id";
UPDATE "simple_stock_holds" x SET "variant_id" = m."variant_id"
FROM "catalog_v2_base_variants" m WHERE x."variant_id" IS NULL AND x."product_id" = m."product_id";
DROP TABLE "catalog_v2_base_variants";

ALTER TABLE "purchase_invoice_items" ALTER COLUMN "variant_id" SET NOT NULL;
ALTER TABLE "inventory_batches" ALTER COLUMN "variant_id" SET NOT NULL;
ALTER TABLE "cart_items" ALTER COLUMN "variant_id" SET NOT NULL;
ALTER TABLE "order_items" ALTER COLUMN "variant_id" SET NOT NULL;
ALTER TABLE "simple_stock_holds" ALTER COLUMN "variant_id" SET NOT NULL;

ALTER TABLE "purchase_invoice_items" ALTER COLUMN "quantity" TYPE DECIMAL(20,3) USING "quantity"::DECIMAL(20,3);
ALTER TABLE "inventory_batches" ALTER COLUMN "qty_received" TYPE DECIMAL(20,3) USING "qty_received"::DECIMAL(20,3);
ALTER TABLE "batch_stock" ALTER COLUMN "quantity" TYPE DECIMAL(20,3) USING "quantity"::DECIMAL(20,3);
ALTER TABLE "stock_movements" ALTER COLUMN "quantity" TYPE DECIMAL(20,3) USING "quantity"::DECIMAL(20,3);
ALTER TABLE "cart_items" ALTER COLUMN "quantity" TYPE DECIMAL(20,3) USING "quantity"::DECIMAL(20,3);
ALTER TABLE "order_items" ALTER COLUMN "quantity" TYPE DECIMAL(20,3) USING "quantity"::DECIMAL(20,3);
ALTER TABLE "simple_stock_holds" ALTER COLUMN "quantity" TYPE DECIMAL(20,3) USING "quantity"::DECIMAL(20,3);
ALTER TABLE "stock_reservations" ALTER COLUMN "quantity" TYPE DECIMAL(20,3) USING "quantity"::DECIMAL(20,3);
ALTER TABLE "pick_list_items" ALTER COLUMN "quantity" TYPE DECIMAL(20,3) USING "quantity"::DECIMAL(20,3);
ALTER TABLE "return_items" ALTER COLUMN "quantity" TYPE DECIMAL(20,3) USING "quantity"::DECIMAL(20,3);
ALTER TABLE "return_items" ALTER COLUMN "approved_quantity" TYPE DECIMAL(20,3) USING "approved_quantity"::DECIMAL(20,3);

CREATE TABLE "price_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "version" SERIAL NOT NULL,
  "exchange_rate_id" UUID NOT NULL,
  "currency_code" CHAR(3) NOT NULL,
  "rate" DECIMAL(24,10) NOT NULL,
  "rounding_multiple" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "published_by" UUID NOT NULL,
  "variant_count" INTEGER NOT NULL,
  "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "price_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "price_versions_version_key" UNIQUE ("version"),
  CONSTRAINT "price_versions_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id")
    REFERENCES "exchange_rates"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "idx_price_versions_currency" ON "price_versions"("currency_code", "published_at" DESC);

CREATE TABLE "linked_price_previews" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_id" UUID NOT NULL,
  "currency_code" CHAR(3) NOT NULL,
  "proposed_rate" DECIMAL(24,10) NOT NULL,
  "effective_at" TIMESTAMPTZ(6) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "linked_price_previews_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_linked_price_previews_actor" ON "linked_price_previews"("actor_id", "expires_at");

ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_reference_currency_code_fkey"
  FOREIGN KEY ("reference_currency_code") REFERENCES "currencies"("code") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_price_version_id_fkey"
  FOREIGN KEY ("price_version_id") REFERENCES "price_versions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_awaiting_rate_id_fkey"
  FOREIGN KEY ("awaiting_rate_id") REFERENCES "exchange_rates"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_catalog_v2_check" CHECK (
  "base_unit" <> '' AND
  ("low_stock_threshold" IS NULL OR "low_stock_threshold" >= 0) AND
  ("selling_price" IS NULL OR "selling_price" >= 0) AND
  "pricing_mode" IN ('fixed', 'linked') AND
  (
    ("pricing_mode" = 'fixed' AND "reference_currency_code" IS NULL AND "reference_price" IS NULL) OR
    ("pricing_mode" = 'linked' AND "reference_currency_code" IS NOT NULL AND "reference_price" > 0)
  )
);
CREATE INDEX "idx_product_variants_linked" ON "product_variants"("pricing_mode", "reference_currency_code");

-- A category can be a root department or its direct child, never a third
-- level. The trigger also prevents moving a category with children below a
-- different root under concurrent writes.
CREATE FUNCTION "enforce_two_level_category"() RETURNS trigger AS $$
BEGIN
  IF NEW."parent_id" IS NOT NULL THEN
    IF NEW."parent_id" = NEW."id" THEN
      RAISE EXCEPTION 'CATEGORY_MAX_DEPTH: a category cannot parent itself' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM "categories" p WHERE p."id" = NEW."parent_id" AND p."parent_id" IS NOT NULL) THEN
      RAISE EXCEPTION 'CATEGORY_MAX_DEPTH: subcategories cannot have children' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM "categories" c WHERE c."parent_id" = NEW."id") THEN
      RAISE EXCEPTION 'CATEGORY_MAX_DEPTH: a category with children cannot become a child' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "categories_two_level_trigger"
BEFORE INSERT OR UPDATE OF "parent_id" ON "categories"
FOR EACH ROW EXECUTE FUNCTION "enforce_two_level_category"();

-- Fractional writes are rejected at the database boundary for piece SKUs,
-- including writes that bypass the API.
CREATE FUNCTION "enforce_sku_quantity"() RETURNS trigger AS $$
DECLARE
  sku_id UUID;
  whole_only BOOLEAN;
  amount NUMERIC;
BEGIN
  IF TG_TABLE_NAME IN ('purchase_invoice_items', 'inventory_batches', 'cart_items', 'order_items', 'simple_stock_holds') THEN
    sku_id := (to_jsonb(NEW)->>'variant_id')::UUID;
  ELSIF TG_TABLE_NAME IN ('batch_stock', 'stock_movements', 'stock_reservations', 'pick_list_items') THEN
    SELECT "variant_id" INTO sku_id FROM "inventory_batches" WHERE "id" = (to_jsonb(NEW)->>'batch_id')::UUID;
  ELSIF TG_TABLE_NAME = 'return_items' THEN
    SELECT "variant_id" INTO sku_id FROM "order_items" WHERE "id" = (to_jsonb(NEW)->>'order_item_id')::UUID;
  END IF;
  SELECT "whole_units_only" INTO whole_only FROM "product_variants" WHERE "id" = sku_id;
  IF TG_TABLE_NAME = 'inventory_batches' THEN
    amount := (to_jsonb(NEW)->>'qty_received')::NUMERIC;
  ELSE
    amount := (to_jsonb(NEW)->>'quantity')::NUMERIC;
  END IF;
  IF whole_only AND amount <> trunc(amount) THEN
    RAISE EXCEPTION 'SKU_WHOLE_UNITS_ONLY: fractional quantity is not allowed for this SKU' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'return_items' AND whole_only
     AND (to_jsonb(NEW)->>'approved_quantity')::NUMERIC <> trunc((to_jsonb(NEW)->>'approved_quantity')::NUMERIC) THEN
    RAISE EXCEPTION 'SKU_WHOLE_UNITS_ONLY: fractional approved quantity is not allowed for this SKU' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "purchase_invoice_items_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "purchase_invoice_items" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "inventory_batches_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "qty_received" ON "inventory_batches" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "batch_stock_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "batch_stock" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "stock_movements_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "stock_movements" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "cart_items_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "cart_items" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "order_items_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "order_items" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "simple_stock_holds_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "simple_stock_holds" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "stock_reservations_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "stock_reservations" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "pick_list_items_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity" ON "pick_list_items" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();
CREATE TRIGGER "return_items_sku_quantity_trigger" BEFORE INSERT OR UPDATE OF "quantity", "approved_quantity" ON "return_items" FOR EACH ROW EXECUTE FUNCTION "enforce_sku_quantity"();

-- Some pre-release databases experimented with a negotiations table. If one
-- exists, close only its open rows; completed sales are untouched. Any held
-- reservation owned by such a negotiation is released when that optional
-- legacy column is present.
DO $$
BEGIN
  IF to_regclass('public.negotiations') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='negotiations' AND column_name='status') THEN
    EXECUTE 'UPDATE negotiations SET status = ''closed_removed'' WHERE status NOT IN (''closed_removed'', ''completed'')';
  END IF;
  IF to_regclass('public.stock_reservations') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_reservations' AND column_name='negotiation_id') THEN
    EXECUTE 'UPDATE stock_reservations SET status = ''released'' WHERE negotiation_id IS NOT NULL AND status = ''reserved''';
  END IF;
END;
$$;

INSERT INTO "store_settings" ("key", "value") VALUES
  ('sale_rounding_multiple', '0')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "permissions" ("key", "group", "description") VALUES
  ('catalog.brands', 'catalog', 'Manage brands'),
  ('prices.publish_linked', 'catalog', 'Publish linked SKU prices')
ON CONFLICT ("key") DO UPDATE SET
  "group" = EXCLUDED."group", "description" = EXCLUDED."description";

INSERT INTO "preset_permissions" ("preset_id", "permission_id")
SELECT pp."id", p."id"
FROM "permission_presets" pp
CROSS JOIN "permissions" p
WHERE pp."name" = 'super_admin' AND p."key" IN ('catalog.brands', 'prices.publish_linked')
ON CONFLICT DO NOTHING;


-- =====================================================================
-- END OF SCHEMA — Shubayr v2.0
-- =====================================================================

-- Phase 5 inventory schema is kept in the Prisma migration so bootstrap and
-- migration paths execute the exact same DDL.
\ir ../../backend/prisma/migrations/20260930040000_inventory_costing/migration.sql

-- Phase 6 uses the production migration as the single DDL source.
\ir ../../backend/prisma/migrations/20261001031500_phase6_purchasing_suppliers/migration.sql

-- Phase 7 uses the production migration as the single DDL source.
\ir ../../backend/prisma/migrations/20261001050000_phase7_order_lifecycle_v2/migration.sql

-- Business-date defaults are removed by the production sweep migration.
\ir ../../backend/prisma/migrations/20261003120000_business_date_sweep/migration.sql
