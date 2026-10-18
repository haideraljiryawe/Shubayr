-- Phase 12, reports part 1: durable background exports, report permissions,
-- and covering indexes for posted-document report ranges.

CREATE TABLE "report_exports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "report_type" VARCHAR(32) NOT NULL,
  "format" VARCHAR(8) NOT NULL,
  "language" VARCHAR(2) NOT NULL DEFAULT 'en',
  "parameters" JSONB NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'queued',
  "rows_total" INTEGER NOT NULL DEFAULT 0,
  "rows_done" INTEGER NOT NULL DEFAULT 0,
  "object_key" VARCHAR(500),
  "file_name" VARCHAR(255),
  "content_type" VARCHAR(120),
  "last_error" VARCHAR(500),
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_exports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "report_exports_type_check" CHECK ("report_type" IN ('sales','profitability','profit_loss','trial_balance','balance_sheet')),
  CONSTRAINT "report_exports_format_check" CHECK ("format" IN ('csv','xlsx')),
  CONSTRAINT "report_exports_language_check" CHECK ("language" IN ('ar','en')),
  CONSTRAINT "report_exports_status_check" CHECK ("status" IN ('queued','processing','completed','failed')),
  CONSTRAINT "report_exports_progress_check" CHECK ("rows_total" >= 0 AND "rows_done" >= 0 AND "rows_done" <= "rows_total")
);

CREATE INDEX "idx_report_exports_creator" ON "report_exports"("created_by", "created_at" DESC, "id" DESC);
CREATE INDEX "idx_report_exports_status" ON "report_exports"("status", "created_at");
CREATE INDEX "idx_delivery_collections_report_range" ON "delivery_collections"("accounting_date", "order_id");
CREATE INDEX "idx_returns_report_range" ON "returns"("accounting_date", "status", "order_id");
CREATE INDEX "idx_return_items_report_order_item" ON "return_items"("order_item_id", "return_id");
CREATE INDEX "idx_custody_holdings_report_cost" ON "custody_holdings"("order_item_id", "status");
CREATE INDEX "idx_inventory_write_downs_report_range" ON "inventory_write_downs"("accounting_date", "id");

INSERT INTO "permissions" ("key", "group", "description") VALUES
  ('reports.sales.read', 'reports', 'View sales reports'),
  ('reports.profit.read', 'reports', 'View product costs and profitability reports'),
  ('reports.financial.read', 'reports', 'View financial statements')
ON CONFLICT ("key") DO UPDATE SET "group" = EXCLUDED."group", "description" = EXCLUDED."description";

-- The legacy broad report grant must not leave operations with financial or
-- cost access. Keep the permission row for compatibility with custom roles,
-- but remove it from the shipped presets in favor of the scoped permissions.
DELETE FROM "preset_permissions" pp
USING "permission_presets" preset, "permissions" permission
WHERE pp."preset_id" = preset."id"
  AND pp."permission_id" = permission."id"
  AND permission."key" = 'reports.view'
  AND preset."name" IN ('operations', 'accountant');

INSERT INTO "preset_permissions" ("preset_id", "permission_id")
SELECT preset."id", permission."id"
FROM "permission_presets" preset
CROSS JOIN "permissions" permission
WHERE preset."name" = 'super_admin'
   OR (preset."name" = 'accountant' AND permission."key" IN ('reports.sales.read','reports.profit.read','reports.financial.read'))
ON CONFLICT ("preset_id", "permission_id") DO NOTHING;
