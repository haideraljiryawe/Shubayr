-- Shubayr access-model-v2 bootstrap seed. Runtime seeding is performed by
-- backend/prisma/seed.ts; this SQL mirrors the code-defined registry for clean
-- infrastructure bootstraps.

INSERT INTO store_settings(key, value) VALUES
  ('store_name', 'Shubayr'),
  ('currency', 'IQD'),
  ('primary_color', '#0B2A54'),
  ('logo_url', '')
ON CONFLICT (key) DO NOTHING;

INSERT INTO roles(name, description, is_system) VALUES
  ('customer', 'End customer app role', TRUE),
  ('delivery_agent', 'Delivery agent app role', TRUE),
  ('order_monitor', 'Read-only order monitor app role', TRUE)
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description, is_system = TRUE;

INSERT INTO permissions(key, "group", description) VALUES
  ('orders.view', 'orders', 'View orders'),
  ('orders.accept', 'orders', 'Accept pending orders'),
  ('orders.reject', 'orders', 'Reject pending orders'),
  ('orders.prepare', 'orders', 'Move accepted orders into preparation'),
  ('orders.mark_ready', 'orders', 'Mark prepared orders ready'),
  ('orders.handover', 'orders', 'Hand ready orders to delivery'),
  ('orders.cancel', 'orders', 'Cancel an order'),
  ('orders.assign_agent', 'orders', 'Assign a delivery agent'),
  ('catalog.categories', 'catalog', 'Manage categories'),
  ('catalog.brands', 'catalog', 'Manage brands'),
  ('catalog.products', 'catalog', 'Manage products and banners'),
  ('prices.change', 'catalog', 'Change sale prices'),
  ('cost.view', 'purchasing', 'View product cost'),
  ('suppliers.view', 'purchasing', 'View suppliers'),
  ('suppliers.manage', 'purchasing', 'Manage suppliers'),
  ('purchases.create', 'purchasing', 'Create purchase invoices'),
  ('purchases.correct', 'purchasing', 'Correct purchase invoices'),
  ('payments.record', 'payments', 'Record payments'),
  ('payments.reverse', 'payments', 'Reverse payments'),
  ('inventory.count', 'inventory', 'Count inventory'),
  ('inventory.pick', 'inventory', 'Pick reserved inventory'),
  ('inventory.transfer', 'inventory', 'Transfer inventory'),
  ('inventory.adjust', 'inventory', 'Adjust inventory'),
  ('returns.inspect', 'returns', 'Inspect returns'),
  ('returns.approve', 'returns', 'Approve returns'),
  ('returns.refund', 'returns', 'Refund returns'),
  ('reviews.moderate', 'reviews', 'Moderate product reviews'),
  ('loyalty.adjust', 'loyalty', 'Adjust loyalty balances'),
  ('deliveries.manage', 'deliveries', 'List and manage deliveries'),
  ('users.manage', 'access', 'Manage staff and work phones'),
  ('roles.manage', 'access', 'Manage permission presets'),
  ('audit.view', 'access', 'View audit logs'),
  ('fx_rates.update', 'finance', 'Update exchange rates'),
  ('ledger.view', 'finance', 'View ledger and trial balance'),
  ('ledger.reverse', 'finance', 'Reverse posted ledger entries'),
  ('cash_accounts.manage', 'finance', 'Manage cash and bank accounts'),
  ('period.reopen', 'accounting', 'Reopen closed accounting periods'),
  ('backdate.approve', 'controls', 'Approve documents outside the back-dating window'),
  ('settings.manage', 'settings', 'Manage store settings'),
  ('reports.view', 'reports', 'View reports'),
  ('period.close', 'accounting', 'Close accounting periods')
ON CONFLICT (key) DO UPDATE
SET "group" = EXCLUDED."group", description = EXCLUDED.description;

INSERT INTO permission_presets(name, description, is_system) VALUES
  ('super_admin', 'All current permissions', TRUE),
  ('operations', 'Orders, deliveries, returns, reviews, loyalty and reports', TRUE),
  ('catalog_editor', 'Catalog and price management', TRUE),
  ('stock_controller', 'Purchasing and inventory control', TRUE)
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description, is_system = TRUE;

INSERT INTO preset_permissions(preset_id, permission_id)
SELECT pp.id, p.id FROM permission_presets pp CROSS JOIN permissions p
WHERE pp.name = 'super_admin'
ON CONFLICT DO NOTHING;

INSERT INTO preset_permissions(preset_id, permission_id)
SELECT pp.id, p.id FROM permission_presets pp CROSS JOIN permissions p
WHERE pp.name = 'operations' AND p.key IN
  ('orders.view','orders.accept','orders.reject','orders.prepare','orders.mark_ready',
   'orders.handover','orders.cancel','orders.assign_agent','deliveries.manage',
   'returns.inspect','returns.approve','returns.refund','reviews.moderate',
   'loyalty.adjust','reports.view')
ON CONFLICT DO NOTHING;

INSERT INTO preset_permissions(preset_id, permission_id)
SELECT pp.id, p.id FROM permission_presets pp CROSS JOIN permissions p
WHERE pp.name = 'catalog_editor' AND p.key IN
  ('catalog.categories','catalog.brands','catalog.products','prices.change')
ON CONFLICT DO NOTHING;

INSERT INTO preset_permissions(preset_id, permission_id)
SELECT pp.id, p.id FROM permission_presets pp CROSS JOIN permissions p
WHERE pp.name = 'stock_controller' AND p.key IN
  ('cost.view','suppliers.view','suppliers.manage','purchases.create',
   'purchases.correct','inventory.count','inventory.pick','inventory.adjust','inventory.transfer')
ON CONFLICT DO NOTHING;

-- C3 read dependencies and payment ownership. The application seed remains
-- canonical; this idempotent block keeps bare infrastructure bootstraps equal.
INSERT INTO permissions(key, "group", description) VALUES
  ('fx_rates.view', 'finance', 'View currencies and exchange rates'),
  ('cash_accounts.view', 'finance', 'View cash and bank accounts')
ON CONFLICT (key) DO UPDATE
SET "group" = EXCLUDED."group", description = EXCLUDED.description;

INSERT INTO store_settings(key, value) VALUES
  ('separation_of_duties_level', 'standard')
ON CONFLICT (key) DO NOTHING;

INSERT INTO permission_presets(name, description, is_system) VALUES
  ('cashier', 'Cashier payments', TRUE),
  ('accountant', 'Accounting and payments', TRUE)
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description, is_system = TRUE;

DELETE FROM preset_permissions grant_row
USING permission_presets preset, permissions permission
WHERE grant_row.preset_id = preset.id
  AND grant_row.permission_id = permission.id
  AND preset.name = 'stock_controller'
  AND permission.key = 'supplier_payments.record';

INSERT INTO preset_permissions(preset_id, permission_id)
SELECT preset.id, permission.id
FROM permission_presets preset
JOIN permissions permission ON (
  preset.name = 'super_admin'
  OR (preset.name = 'stock_controller' AND permission.key = 'fx_rates.view')
  OR (preset.name = 'catalog_editor' AND permission.key IN ('cost.view', 'fx_rates.view'))
  OR (preset.name = 'cashier' AND permission.key IN
    ('suppliers.view','supplier_payments.record','supplier_payments.reverse',
     'cash_accounts.view','fx_rates.view'))
  OR (preset.name = 'accountant' AND permission.key IN
    ('suppliers.view','supplier_payments.record','supplier_payments.reverse',
     'cash_accounts.view','cash_accounts.manage','fx_rates.view','fx_rates.update',
     'ledger.view','ledger.reverse','period.close','period.reopen',
     'backdate.approve','reports.view'))
)
WHERE preset.name IN
  ('super_admin','stock_controller','catalog_editor','cashier','accountant')
ON CONFLICT DO NOTHING;
