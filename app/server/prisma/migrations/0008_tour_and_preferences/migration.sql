-- =============================================================================
-- 0008 — welcome tour + personal email preferences
-- Additive only. Existing people are marked as having seen the tour (they already
-- know the site); everyone keeps receiving the emails they get today.
-- =============================================================================

ALTER TABLE "users" ADD COLUMN "tour_completed_at" TIMESTAMPTZ(3);
ALTER TABLE "users" ADD COLUMN "email_on_message" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "email_reminders" BOOLEAN NOT NULL DEFAULT true;

UPDATE "users" SET "tour_completed_at" = CURRENT_TIMESTAMP WHERE "last_login_at" IS NOT NULL;
