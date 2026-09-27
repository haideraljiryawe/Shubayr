-- Access model v2: separate app roles from administrator permissions and
-- bind every persisted session to its authentication surface.

ALTER TABLE "users"
  ALTER COLUMN "role_id" DROP NOT NULL,
  ALTER COLUMN "phone" DROP NOT NULL,
  ADD COLUMN "username" VARCHAR(80),
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "locked_until" TIMESTAMPTZ(6),
  ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "permission_version" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
ALTER TABLE "users" ADD CONSTRAINT "users_identity_check"
  CHECK ("phone" IS NOT NULL OR "username" IS NOT NULL);
ALTER TABLE "users" ADD CONSTRAINT "users_username_format_check"
  CHECK ("username" IS NULL OR "username" ~ '^[a-z][a-z0-9._-]{2,79}$');

UPDATE "roles" SET "name" = 'delivery_agent', "description" = 'Delivery agent app role'
WHERE "name" = 'delivery';
INSERT INTO "roles" ("name", "description", "is_system") VALUES
  ('order_monitor', 'Read-only order monitor app role', true)
ON CONFLICT ("name") DO UPDATE SET "description" = EXCLUDED."description", "is_system" = true;

CREATE TABLE "permission_presets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(80) NOT NULL,
  "description" VARCHAR(255),
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "permission_presets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "permission_presets_name_key" ON "permission_presets"("name");

CREATE TABLE "preset_permissions" (
  "preset_id" UUID NOT NULL,
  "permission_id" UUID NOT NULL,
  CONSTRAINT "preset_permissions_pkey" PRIMARY KEY ("preset_id", "permission_id"),
  CONSTRAINT "preset_permissions_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "permission_presets"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "preset_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "user_presets" (
  "user_id" UUID NOT NULL,
  "preset_id" UUID NOT NULL,
  "assigned_by" UUID NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_presets_pkey" PRIMARY KEY ("user_id", "preset_id"),
  CONSTRAINT "user_presets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "user_presets_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "permission_presets"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "user_presets_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE "user_permission_grants" (
  "user_id" UUID NOT NULL,
  "permission_id" UUID NOT NULL,
  "granted_by" UUID NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_permission_grants_pkey" PRIMARY KEY ("user_id", "permission_id"),
  CONSTRAINT "user_permission_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "user_permission_grants_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "user_permission_grants_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE "work_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "app_role" VARCHAR(32) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_profiles_user_id_key" UNIQUE ("user_id"),
  CONSTRAINT "work_profiles_app_role_check" CHECK ("app_role" IN ('delivery_agent', 'order_monitor')),
  CONSTRAINT "work_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

ALTER TABLE "refresh_tokens"
  ADD COLUMN "surface" VARCHAR(16) NOT NULL DEFAULT 'app',
  ADD COLUMN "client" VARCHAR(20),
  ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "refresh_tokens_surface_check" CHECK ("surface" IN ('admin', 'app')),
  ADD CONSTRAINT "refresh_tokens_client_check" CHECK ("client" IS NULL OR "client" IN ('mobile', 'web_store'));

ALTER TABLE "audit_logs" ADD COLUMN "reason" VARCHAR(500);

-- Convert the legacy permission role for each staff account into a preset.
INSERT INTO "permission_presets" ("name", "description", "is_system")
SELECT "name", "description", true FROM "roles"
WHERE "name" IN ('admin', 'manager', 'purchasing', 'warehouse')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "preset_permissions" ("preset_id", "permission_id")
SELECT pp."id", rp."permission_id"
FROM "permission_presets" pp
JOIN "roles" r ON r."name" = pp."name"
JOIN "role_permissions" rp ON rp."role_id" = r."id"
ON CONFLICT DO NOTHING;

WITH seed_actor AS (
  SELECT u."id" FROM "users" u JOIN "roles" r ON r."id" = u."role_id"
  WHERE r."name" = 'admin' ORDER BY u."created_at" LIMIT 1
)
INSERT INTO "user_presets" ("user_id", "preset_id", "assigned_by", "reason")
SELECT u."id", pp."id", COALESCE(sa."id", u."id"), 'Migrated from legacy role'
FROM "users" u
JOIN "roles" r ON r."id" = u."role_id"
JOIN "permission_presets" pp ON pp."name" = r."name"
LEFT JOIN seed_actor sa ON true
WHERE r."name" IN ('admin', 'manager', 'purchasing', 'warehouse')
ON CONFLICT DO NOTHING;

UPDATE "users" u SET
  "username" = CASE WHEN r."name" = 'admin' THEN 'admin' ELSE r."name" || '_' || substr(u."id"::text, 1, 8) END,
  "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'customer'),
  "must_change_password" = true,
  "permission_version" = "permission_version" + 1
FROM "roles" r
WHERE u."role_id" = r."id" AND r."name" IN ('admin', 'manager', 'purchasing', 'warehouse');

INSERT INTO "work_profiles" ("user_id", "name", "app_role", "is_active")
SELECT u."id", COALESCE(u."name", 'Delivery agent'), 'delivery_agent', u."is_active"
FROM "users" u JOIN "roles" r ON r."id" = u."role_id"
WHERE r."name" = 'delivery_agent'
ON CONFLICT ("user_id") DO NOTHING;

ALTER TABLE "refresh_tokens" ALTER COLUMN "surface" DROP DEFAULT;
ALTER TABLE "refresh_tokens" ALTER COLUMN "session_version" DROP DEFAULT;
