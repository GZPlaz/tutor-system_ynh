-- =============================================================================
-- 0005 — everything is free: payment features removed
--
-- No table or column is dropped. Past payments, plans, subscriptions and credits
-- stay in the database as read-only history (nothing in the app shows or changes
-- them any more), so no financial record is ever lost by this upgrade.
-- =============================================================================

-- 1. Requests that were waiting for a card payment become normal free requests:
--    the tutor now sees them and confirms or declines as usual.
INSERT INTO "session_feed_posts" ("booking_id", "kind", "message")
SELECT "id", 'SYSTEM', 'Payments were switched off — this request is now free'
FROM "bookings"
WHERE "status" = 'PENDING' AND "payment" = 'AWAITING_PAYMENT';

UPDATE "bookings"
SET "payment" = 'NOT_REQUIRED', "hold_expires_at" = NULL, "price_cents" = NULL, "currency" = NULL
WHERE "status" = 'PENDING' AND "payment" = 'AWAITING_PAYMENT';

-- 2. Queued emails about payments can no longer be rendered (those templates are
--    gone). Mark them as failed with a clear reason instead of retrying forever.
UPDATE "email_outbox"
SET "status" = 'FAILED', "last_error" = 'Not sent: payment features were removed'
WHERE "status" = 'PENDING'
  AND "template" IN ('booking_hold_released', 'payment_refunded', 'credits_added', 'subscription_started', 'subscription_payment_failed');

-- 3. The "Charge for sessions" switch no longer exists.
DELETE FROM "app_settings" WHERE "key" = 'billing';

-- (The billing:read_own / billing:manage permissions are removed from every role
--  automatically when the app starts, because they are no longer in the code.)
