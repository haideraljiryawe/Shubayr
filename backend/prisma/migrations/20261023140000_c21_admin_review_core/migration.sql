ALTER TABLE "users"
  ADD COLUMN "preferred_ui_language" VARCHAR(2) NOT NULL DEFAULT 'ar';

ALTER TABLE "users"
  ADD CONSTRAINT "users_preferred_ui_language_check"
  CHECK ("preferred_ui_language" IN ('ar', 'en'));
