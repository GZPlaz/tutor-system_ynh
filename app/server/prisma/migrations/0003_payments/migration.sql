-- =============================================================================
-- 0003 — payments (Stripe): pay per session, session packages, subscriptions
-- Additive only. Existing bookings are marked NOT_REQUIRED (nothing to pay).
-- =============================================================================

CREATE TYPE "BookingPayment" AS ENUM ('NOT_REQUIRED', 'AWAITING_PAYMENT', 'PAID', 'REFUNDED', 'CREDIT_USED', 'CREDIT_RETURNED', 'INCLUDED_IN_PLAN');
CREATE TYPE "PaymentKind" AS ENUM ('SESSION', 'PACKAGE', 'SUBSCRIPTION');

-- Users: Stripe customer
ALTER TABLE "users" ADD COLUMN "stripe_customer_ref" TEXT;
CREATE UNIQUE INDEX "users_stripe_customer_ref_key" ON "users"("stripe_customer_ref");

-- Bookings: how each one is paid for
ALTER TABLE "bookings"
    ADD COLUMN "payment" "BookingPayment" NOT NULL DEFAULT 'NOT_REQUIRED',
    ADD COLUMN "price_cents" INTEGER,
    ADD COLUMN "currency" TEXT,
    ADD COLUMN "hold_expires_at" TIMESTAMPTZ(3),
    ADD COLUMN "checkout_ref" TEXT,
    ADD COLUMN "subscription_id" UUID;
CREATE UNIQUE INDEX "bookings_checkout_ref_key" ON "bookings"("checkout_ref");
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Find held slots whose checkout ran out quickly.
CREATE INDEX "bookings_awaiting_payment_idx" ON "bookings"("hold_expires_at") WHERE "payment" = 'AWAITING_PAYMENT';

-- Plans: packages (credits) and subscriptions (sessions per period)
ALTER TABLE "plans"
    ADD COLUMN "provider_product_ref" TEXT,
    ADD COLUMN "session_credits" INTEGER,
    ADD COLUMN "sessions_per_period" INTEGER,
    ADD COLUMN "service_id" UUID;
ALTER TABLE "plans" ADD CONSTRAINT "plans_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "plans" ADD CONSTRAINT "plans_shape_chk" CHECK (
  ("interval" = 'ONE_TIME' AND "session_credits" IS NOT NULL AND "session_credits" > 0)
  OR ("interval" <> 'ONE_TIME' AND ("sessions_per_period" IS NULL OR "sessions_per_period" > 0))
);

-- Payments: what was bought, receipts, refunds
ALTER TABLE "payments"
    ADD COLUMN "kind" "PaymentKind" NOT NULL DEFAULT 'SESSION',
    ADD COLUMN "plan_id" UUID,
    ADD COLUMN "description" TEXT,
    ADD COLUMN "receipt_url" TEXT,
    ADD COLUMN "refunded_cents" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "refund_ref" TEXT,
    ADD COLUMN "refund_requested_at" TIMESTAMPTZ(3),
    ADD COLUMN "refunded_at" TIMESTAMPTZ(3);
ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_chk" CHECK ("refunded_cents" >= 0 AND "refunded_cents" <= "amount_cents");

-- Session-credit ledger
CREATE TABLE "session_credits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "service_id" UUID,
    "booking_id" UUID,
    "payment_id" UUID,
    "reason" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "session_credits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "session_credits_delta_chk" CHECK ("delta" <> 0)
);
CREATE INDEX "session_credits_user_id_idx" ON "session_credits"("user_id");
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- A booking can use at most one credit, and give it back at most once.
CREATE UNIQUE INDEX "session_credits_one_use_per_booking" ON "session_credits"("booking_id") WHERE "delta" < 0;
CREATE UNIQUE INDEX "session_credits_one_return_per_booking" ON "session_credits"("booking_id") WHERE "delta" > 0 AND "booking_id" IS NOT NULL;
