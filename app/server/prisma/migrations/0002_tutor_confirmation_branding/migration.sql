-- =============================================================================
-- 0002 — tutor confirmation & live sessions, account/service deletion, branding
-- Safe on a live database: only additive changes; existing bookings keep their
-- status (CONFIRMED ones are marked as confirmed at their creation time).
-- =============================================================================

-- Bookings: tutors now confirm requests, may decline, and can start/end early.
-- (ADD VALUE is allowed inside a transaction on PostgreSQL 12+ as long as the
-- new value isn't used in the same transaction — it isn't.)
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'DECLINED';

ALTER TABLE "bookings"
    ADD COLUMN "confirmed_at" TIMESTAMPTZ(3),
    ADD COLUMN "started_at" TIMESTAMPTZ(3),
    ADD COLUMN "ended_at" TIMESTAMPTZ(3),
    ALTER COLUMN "status" SET DEFAULT 'PENDING';

UPDATE "bookings" SET "confirmed_at" = "created_at" WHERE "status" IN ('CONFIRMED', 'COMPLETED', 'NO_SHOW');

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_live_range_chk"
  CHECK ("ended_at" IS NULL OR "started_at" IS NULL OR "ended_at" >= "started_at");

-- Deleting accounts/services that have history keeps a scrubbed row.
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);
ALTER TABLE "services" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

-- Site settings (branding)
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
