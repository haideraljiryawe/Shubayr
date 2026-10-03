INSERT INTO "permissions" ("key", "group", "description") VALUES
  ('fx_rates.view', 'finance', 'View currencies and exchange rates'),
  ('cash_accounts.view', 'finance', 'View cash and bank accounts')
ON CONFLICT ("key") DO UPDATE SET
  "group" = EXCLUDED."group",
  "description" = EXCLUDED."description";

INSERT INTO "store_settings" ("key", "value")
VALUES ('separation_of_duties_level', 'standard')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "permission_presets" ("name", "description", "is_system") VALUES
  ('cashier', 'Development cashier preset', TRUE),
  ('accountant', 'Development accountant preset', TRUE)
ON CONFLICT ("name") DO UPDATE SET
  "description" = EXCLUDED."description",
  "is_system" = TRUE;

DELETE FROM "preset_permissions"
WHERE "preset_id" = (
  SELECT "id" FROM "permission_presets" WHERE "name" = 'stock_controller'
)
AND "permission_id" = (
  SELECT "id" FROM "permissions" WHERE "key" = 'supplier_payments.record'
);

INSERT INTO "preset_permissions" ("preset_id", "permission_id")
SELECT preset."id", permission."id"
FROM "permission_presets" AS preset
JOIN "permissions" AS permission ON (
  preset."name" = 'super_admin'
  OR (preset."name" = 'stock_controller' AND permission."key" = 'fx_rates.view')
  OR (preset."name" = 'catalog_editor' AND permission."key" IN ('cost.view', 'fx_rates.view'))
  OR (
    preset."name" = 'cashier'
    AND permission."key" IN (
      'suppliers.view',
      'supplier_payments.record',
      'supplier_payments.reverse',
      'cash_accounts.view',
      'fx_rates.view'
    )
  )
  OR (
    preset."name" = 'accountant'
    AND permission."key" IN (
      'suppliers.view',
      'supplier_payments.record',
      'supplier_payments.reverse',
      'cash_accounts.view',
      'cash_accounts.manage',
      'fx_rates.view',
      'fx_rates.update',
      'ledger.view',
      'ledger.reverse',
      'period.close',
      'period.reopen',
      'backdate.approve',
      'reports.view'
    )
  )
)
WHERE preset."name" IN (
  'super_admin',
  'stock_controller',
  'catalog_editor',
  'cashier',
  'accountant'
)
ON CONFLICT DO NOTHING;

ALTER TABLE "products"
  ADD COLUMN "price_proposed_by" UUID;

ALTER TABLE "product_variants"
  ADD COLUMN "price_proposed_by" UUID;

ALTER TABLE "price_versions"
  ADD COLUMN "proposed_by" UUID;

UPDATE "price_versions"
SET "proposed_by" = "published_by"
WHERE "proposed_by" IS NULL;

ALTER TABLE "price_versions"
  ALTER COLUMN "proposed_by" SET NOT NULL;

CREATE TABLE "price_publish_approvals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "preview_id" UUID,
  "price_version_id" UUID,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "proposed_by" UUID NOT NULL,
  "decided_by" UUID,
  "proposal_reason" VARCHAR(500) NOT NULL,
  "decision_reason" VARCHAR(500),
  "breaches" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at" TIMESTAMPTZ(6),
  CONSTRAINT "price_publish_approvals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "price_publish_approvals_status_check"
    CHECK ("status" IN ('pending', 'approved', 'rejected')),
  CONSTRAINT "price_publish_approvals_decision_check"
    CHECK (
      ("status" = 'pending' AND "decided_by" IS NULL AND "decided_at" IS NULL)
      OR
      ("status" IN ('approved', 'rejected') AND "decided_by" IS NOT NULL AND "decided_at" IS NOT NULL)
    ),
  CONSTRAINT "price_publish_approvals_preview_id_fkey"
    FOREIGN KEY ("preview_id") REFERENCES "linked_price_previews"("id") ON DELETE SET NULL,
  CONSTRAINT "price_publish_approvals_price_version_id_fkey"
    FOREIGN KEY ("price_version_id") REFERENCES "price_versions"("id"),
  CONSTRAINT "price_publish_approvals_proposed_by_fkey"
    FOREIGN KEY ("proposed_by") REFERENCES "users"("id"),
  CONSTRAINT "price_publish_approvals_decided_by_fkey"
    FOREIGN KEY ("decided_by") REFERENCES "users"("id")
);

CREATE UNIQUE INDEX "price_publish_approvals_preview_id_key"
  ON "price_publish_approvals"("preview_id");
CREATE UNIQUE INDEX "price_publish_approvals_price_version_id_key"
  ON "price_publish_approvals"("price_version_id");
CREATE INDEX "idx_price_publish_approvals_status"
  ON "price_publish_approvals"("status", "created_at" DESC);
