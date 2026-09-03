-- =====================================================================
-- Shubayr — RBAC + white-label seed (safe to run after schema.sql)
-- Detailed roles & permissions from day one (team review point #3).
-- =====================================================================

-- White-label defaults
INSERT INTO store_settings(key, value) VALUES
  ('store_name', 'Shubayr'),
  ('currency', 'IQD'),
  ('primary_color', '#0B2A54'),
  ('logo_url', '')
ON CONFLICT (key) DO NOTHING;

-- Roles
INSERT INTO roles(name, description, is_system) VALUES
  ('admin',       'Full system access',                      TRUE),
  ('manager',     'Store operations & catalog',              TRUE),
  ('purchasing',  'Suppliers & purchase invoices',           TRUE),
  ('warehouse',   'Stock, batches, picking',                 TRUE),
  ('delivery',    'Delivery agent',                          TRUE),
  ('customer',    'End customer',                            TRUE)
ON CONFLICT (name) DO NOTHING;

-- Permissions (grouped)
INSERT INTO permissions(key, "group", description) VALUES
  ('catalog.view',        'catalog',    'View products & categories'),
  ('catalog.manage',      'catalog',    'Create/update products & categories'),
  ('orders.view',         'orders',     'View orders'),
  ('orders.confirm',      'orders',     'Confirm/cancel orders'),
  ('orders.update',       'orders',     'Update order status'),
  ('inventory.view',      'inventory',  'View stock, batches, locations'),
  ('inventory.pick',      'inventory',  'Perform picking'),
  ('inventory.adjust',    'inventory',  'Controlled stock adjustments'),
  ('inventory.transfer',  'inventory',  'Transfer stock between locations'),
  ('purchasing.view',     'purchasing', 'View suppliers & purchase invoices'),
  ('purchasing.manage',   'purchasing', 'Create/receive purchase invoices'),
  ('returns.view',        'returns',    'View returns'),
  ('returns.process',     'returns',    'Approve/inspect/settle returns'),
  ('delivery.assigned',   'delivery',   'View & update assigned deliveries'),
  ('loyalty.manage',      'loyalty',    'Adjust loyalty points'),
  ('users.manage',        'users',      'Manage users & roles'),
  ('reports.view',        'reports',    'View reports & analytics'),
  ('settings.manage',     'settings',   'Manage store settings (white-label)')
ON CONFLICT (key) DO NOTHING;

-- Grant everything to admin
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- Manager: catalog + orders + inventory view + returns + reports
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'manager' AND p.key IN
  ('catalog.view','catalog.manage','orders.view','orders.confirm','orders.update',
   'inventory.view','returns.view','returns.process','reports.view','loyalty.manage')
ON CONFLICT DO NOTHING;

-- Purchasing
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'purchasing' AND p.key IN
  ('purchasing.view','purchasing.manage','inventory.view','catalog.view')
ON CONFLICT DO NOTHING;

-- Warehouse
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'warehouse' AND p.key IN
  ('inventory.view','inventory.pick','inventory.adjust','inventory.transfer','orders.view')
ON CONFLICT DO NOTHING;

-- Delivery
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'delivery' AND p.key IN ('delivery.assigned','orders.view')
ON CONFLICT DO NOTHING;
