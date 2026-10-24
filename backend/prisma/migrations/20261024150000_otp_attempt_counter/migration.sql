ALTER TABLE "otp_codes"
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "otp_codes"
  ADD CONSTRAINT "otp_codes_attempt_count_check" CHECK ("attempt_count" >= 0);
