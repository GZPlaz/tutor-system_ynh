-- =============================================================================
-- 0004 — site settings + bookings without an account
-- Additive only. Existing users are NOT guests, so nothing changes for them.
--
-- Site settings (Admin → Settings) are stored as one JSON document in the
-- existing "app_settings" table (key 'general'), so they need no new table.
-- Until an admin saves them, the defaults reproduce the old behaviour exactly:
-- sign-ups need approval and an account is needed to book.
-- =============================================================================

ALTER TABLE "users" ADD COLUMN "is_guest" BOOLEAN NOT NULL DEFAULT false;

-- A guest never signs in, so it must never hold a password. (Turning a guest into a
-- real account clears is_guest and sets the password in the same UPDATE.)
ALTER TABLE "users" ADD CONSTRAINT "users_guest_no_password_chk"
  CHECK (NOT "is_guest" OR "password_hash" IS NULL);
