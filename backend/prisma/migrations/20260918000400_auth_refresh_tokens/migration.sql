-- Refresh sessions support one-time rotation. Rollback: revoke all active
-- sessions, deploy clients that re-authenticate by OTP, then DROP TABLE
-- refresh_tokens. No user or OTP data is rewritten by this migration.
CREATE INDEX "idx_otp_codes_phone_active"
  ON "otp_codes"("phone", "consumed_at", "created_at");

CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "idx_refresh_tokens_user" ON "refresh_tokens"("user_id");
CREATE INDEX "idx_refresh_tokens_expiry" ON "refresh_tokens"("expires_at");

ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
