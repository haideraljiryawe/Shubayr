-- Bind push registrations to a stable refresh-token lineage without changing
-- the public device-registration request. Existing device rows intentionally
-- remain unbound and ineligible until the authenticated app re-registers.
ALTER TABLE "refresh_tokens" ADD COLUMN "session_id" UUID;
UPDATE "refresh_tokens" SET "session_id" = "id" WHERE "session_id" IS NULL;
ALTER TABLE "refresh_tokens" ALTER COLUMN "session_id" SET NOT NULL;

ALTER TABLE "device_tokens" ADD COLUMN "session_id" UUID;

CREATE INDEX "idx_refresh_tokens_session_eligibility"
  ON "refresh_tokens"("user_id", "session_id", "revoked_at", "expires_at");
CREATE INDEX "idx_device_tokens_session_eligibility"
  ON "device_tokens"("user_id", "session_id", "is_active", "last_seen_at");

-- Internal test events use the normal outbox but are hidden from customer
-- inbox history and can target an explicit set of eligible registrations.
ALTER TABLE "notification_events"
  ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "target_device_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

-- Delivery claims and structured provider outcomes make worker retries safe
-- and keep stored errors free of provider payloads or registration tokens.
ALTER TABLE "notification_logs"
  ALTER COLUMN "status" TYPE VARCHAR(16),
  ADD COLUMN "error_code" VARCHAR(80),
  ADD COLUMN "provider_message_id" VARCHAR(255),
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lease_until" TIMESTAMPTZ(6);
