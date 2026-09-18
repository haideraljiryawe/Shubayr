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

CREATE TABLE addresses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label           VARCHAR(80),
    city            VARCHAR(80),
    area            VARCHAR(120),
    street          VARCHAR(160),
    details         TEXT,
    lat             DOUBLE PRECISION,
    lng             DOUBLE PRECISION,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE
);

-- FCM push-notification device tokens (one row per device/token per user)
CREATE TABLE device_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token           VARCHAR(512) NOT NULL,
    platform        VARCHAR(16) NOT NULL,   -- android | ios | web
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, token)
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
    icon            VARCHAR(160),
    sort_order      INT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
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
    sort_order      INT NOT NULL DEFAULT 0
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
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 8. CART & WISHLIST
-- ---------------------------------------------------------------------
CREATE TABLE carts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

-- ---------------------------------------------------------------------
-- 10. ORDERS
-- ---------------------------------------------------------------------
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    address_id      UUID REFERENCES addresses(id),
    coupon_id       UUID REFERENCES coupons(id),
    order_number    VARCHAR(40) UNIQUE NOT NULL,
    status          VARCHAR(30) NOT NULL DEFAULT 'pending',
        -- pending | confirmed | processing | out_for_delivery | delivered
        -- | failed_delivery | cancelled | return_requested | returned
    payment_method  VARCHAR(20) NOT NULL DEFAULT 'cod',
    subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
    delivery_fee    NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount        NUMERIC(12,2) NOT NULL DEFAULT 0,
    total           NUMERIC(12,2) NOT NULL DEFAULT 0,
    placed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
    line_total      NUMERIC(12,2) NOT NULL
);

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

-- ---------------------------------------------------------------------
-- 13. RETURNS (partial returns allowed; condition drives restock)
-- ---------------------------------------------------------------------
CREATE TABLE returns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    type            VARCHAR(20) NOT NULL DEFAULT 'return',   -- return | exchange
    status          VARCHAR(20) NOT NULL DEFAULT 'requested',-- requested | approved | collected | settled | rejected
    reason          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE return_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id       UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
    order_item_id   UUID NOT NULL REFERENCES order_items(id),
    quantity        INT NOT NULL CHECK (quantity > 0),       -- may be < ordered qty (partial return)
    condition       VARCHAR(20) NOT NULL,                    -- sellable | opened | damaged
    restock         BOOLEAN NOT NULL DEFAULT FALSE,          -- only sellable normally re-enters stock
    batch_id        UUID REFERENCES inventory_batches(id)    -- batch it is restocked into, if any
);

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
    UNIQUE (order_item_id, user_id)
);

CREATE TABLE delivery_ratings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id     UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    agent_id        UUID REFERENCES users(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    stars           INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
    comment         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (delivery_id, user_id)
);

-- ---------------------------------------------------------------------
-- 15. LOYALTY POINTS  (ledger from the start)
-- ---------------------------------------------------------------------
CREATE TABLE loyalty_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points_balance  INT NOT NULL DEFAULT 0
);

CREATE TABLE loyalty_ledger (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
    order_id        UUID REFERENCES orders(id),
    type            VARCHAR(20) NOT NULL,   -- earn | redeem | adjust | expire
    points          INT NOT NULL,           -- +earn / -redeem
    note            VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
CREATE INDEX idx_orders_user            ON orders(user_id);
CREATE INDEX idx_orders_status          ON orders(status);
CREATE INDEX idx_order_items_order      ON order_items(order_id);
CREATE INDEX idx_returns_order          ON returns(order_id);
CREATE INDEX idx_loyalty_ledger_account ON loyalty_ledger(account_id);
CREATE INDEX idx_audit_entity           ON audit_logs(entity_type, entity_id);

-- =====================================================================
-- END OF SCHEMA — Shubayr v2.0
-- =====================================================================
