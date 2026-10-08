-- Phase 8a: make custody belong to a delivery party rather than directly to
-- a user. Internal-party ids intentionally match their existing user ids so
-- historical references retain their identity during the FK migration.

CREATE TABLE "delivery_parties" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" VARCHAR(24) NOT NULL,
  "user_id" UUID,
  "name" VARCHAR(120) NOT NULL,
  "phone" VARCHAR(32) NOT NULL,
  "vehicle_number" VARCHAR(80),
  "description" TEXT,
  "notes" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_parties_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_parties_user_id_key" UNIQUE ("user_id"),
  CONSTRAINT "delivery_parties_kind_check"
    CHECK ("kind" IN ('internal_agent', 'external_driver')),
  CONSTRAINT "delivery_parties_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION
);

INSERT INTO "delivery_parties" (
  "id", "kind", "user_id", "name", "phone", "is_active", "created_at", "updated_at"
)
SELECT DISTINCT
  u."id",
  'internal_agent',
  u."id",
  COALESCE(wp."name", u."name", 'Delivery agent'),
  COALESCE(u."phone", 'legacy-' || substring(u."id"::text, 1, 24)),
  u."is_active" AND COALESCE(wp."is_active", true),
  u."created_at",
  u."updated_at"
FROM "users" u
LEFT JOIN "work_profiles" wp ON wp."user_id" = u."id"
LEFT JOIN "roles" r ON r."id" = u."role_id"
WHERE r."name" = 'delivery_agent'
   OR wp."app_role" = 'delivery_agent'
   OR u."id" IN (SELECT "agent_id" FROM "deliveries" WHERE "agent_id" IS NOT NULL)
   OR u."id" IN (SELECT "custody_party_id" FROM "custody_holdings")
   OR u."id" IN (SELECT "custody_party_id" FROM "stock_movements" WHERE "custody_party_id" IS NOT NULL)
   OR u."id" IN (SELECT "party_id" FROM "delivery_attempts")
   OR u."id" IN (SELECT "custody_party_id" FROM "retrievals");

ALTER TABLE "deliveries" DROP CONSTRAINT "deliveries_agent_id_fkey";
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "delivery_parties"("id") ON DELETE NO ACTION;

ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_custody_party_id_fkey";
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_custody_party_id_fkey"
  FOREIGN KEY ("custody_party_id") REFERENCES "delivery_parties"("id") ON DELETE NO ACTION;

ALTER TABLE "custody_holdings" DROP CONSTRAINT "custody_holdings_custody_party_id_fkey";
ALTER TABLE "custody_holdings" ADD CONSTRAINT "custody_holdings_custody_party_id_fkey"
  FOREIGN KEY ("custody_party_id") REFERENCES "delivery_parties"("id") ON DELETE NO ACTION;

ALTER TABLE "delivery_attempts" DROP CONSTRAINT "delivery_attempts_party_id_fkey";
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_party_id_fkey"
  FOREIGN KEY ("party_id") REFERENCES "delivery_parties"("id") ON DELETE NO ACTION;

ALTER TABLE "retrievals" DROP CONSTRAINT "retrievals_custody_party_id_fkey";
ALTER TABLE "retrievals" ADD CONSTRAINT "retrievals_custody_party_id_fkey"
  FOREIGN KEY ("custody_party_id") REFERENCES "delivery_parties"("id") ON DELETE NO ACTION;

CREATE INDEX "idx_delivery_parties_kind_active_name"
  ON "delivery_parties"("kind", "is_active", "name");
CREATE INDEX "idx_delivery_parties_phone" ON "delivery_parties"("phone");

INSERT INTO "permissions" ("key", "group", "description") VALUES
  ('drivers.manage', 'deliveries', 'Manage external delivery drivers')
ON CONFLICT ("key") DO UPDATE SET
  "group" = EXCLUDED."group",
  "description" = EXCLUDED."description";

INSERT INTO "preset_permissions" ("preset_id", "permission_id")
SELECT preset."id", permission."id"
FROM "permission_presets" preset
JOIN "permissions" permission ON permission."key" = 'drivers.manage'
WHERE preset."name" IN ('super_admin', 'operations')
ON CONFLICT DO NOTHING;
