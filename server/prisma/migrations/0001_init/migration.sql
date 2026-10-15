-- =============================================================================
-- MindAccel Tutoring — initial schema (PostgreSQL 13+)
-- Mirrors prisma/schema.prisma using Prisma's naming conventions, then adds
-- the integrity constraints Prisma cannot model (section "EXTRA INTEGRITY").
-- Applied with:  npx prisma migrate deploy
-- =============================================================================

-- btree_gist lets an exclusion constraint combine "=" on a UUID with "&&" on a
-- time range. It is a *trusted* extension (PG13+), so the database owner
-- created by YunoHost can install it without superuser rights.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- -----------------------------------------------------------------------------
-- ENUMS
-- -----------------------------------------------------------------------------
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');
CREATE TYPE "ResourceType" AS ENUM ('FILE', 'LINK', 'VIDEO');
CREATE TYPE "FeedPostKind" AS ENUM ('MEETING_LINK', 'NOTE', 'SYSTEM');
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
CREATE TYPE "BillingInterval" AS ENUM ('ONE_TIME', 'MONTH', 'YEAR');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- -----------------------------------------------------------------------------
-- IDENTITY & ACCESS
-- -----------------------------------------------------------------------------
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "rejection_reason" TEXT,
    "last_login_at" TIMESTAMPTZ(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_by_id" UUID,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_at" TIMESTAMPTZ(3),
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- -----------------------------------------------------------------------------
-- SCHEDULING
-- -----------------------------------------------------------------------------
CREATE TABLE "services" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "duration_minutes" INTEGER NOT NULL,
    "buffer_minutes" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "price_cents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tutor_services" (
    "tutor_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    CONSTRAINT "tutor_services_pkey" PRIMARY KEY ("tutor_id","service_id")
);

CREATE TABLE "availability_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tutor_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "effective_from" DATE,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "availability_exceptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tutor_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "availability_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "tutor_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "blocked_until" TIMESTAMPTZ(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "student_notes" TEXT,
    "meeting_url" TEXT,
    "meeting_posted_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" UUID,
    "cancel_reason" TEXT,
    "reminder_24h_sent_at" TIMESTAMPTZ(3),
    "reminder_1h_sent_at" TIMESTAMPTZ(3),
    "link_nudge_sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "session_feed_posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "author_id" UUID,
    "kind" "FeedPostKind" NOT NULL,
    "message" TEXT,
    "meeting_url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "session_feed_posts_pkey" PRIMARY KEY ("id")
);

-- -----------------------------------------------------------------------------
-- CLASSES & RESOURCE HUB
-- -----------------------------------------------------------------------------
CREATE TABLE "groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "group_members" (
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id","user_id")
);

CREATE TABLE "resources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "ResourceType" NOT NULL,
    "folder" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "url" TEXT,
    "storage_key" TEXT,
    "original_name" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "resource_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "resource_id" UUID NOT NULL,
    "student_id" UUID,
    "group_id" UUID,
    "assigned_by_id" UUID,
    "due_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "resource_assignments_pkey" PRIMARY KEY ("id")
);

-- -----------------------------------------------------------------------------
-- EMAIL OUTBOX
-- -----------------------------------------------------------------------------
CREATE TABLE "email_outbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "to_email" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "send_after" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- -----------------------------------------------------------------------------
-- BILLING GROUNDWORK
-- -----------------------------------------------------------------------------
CREATE TABLE "plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "interval" "BillingInterval" NOT NULL,
    "features" JSONB NOT NULL DEFAULT '[]',
    "provider_price_ref" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_customer_ref" TEXT,
    "provider_subscription_ref" TEXT,
    "current_period_start" TIMESTAMPTZ(3),
    "current_period_end" TIMESTAMPTZ(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "subscription_id" UUID,
    "booking_id" UUID,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "provider_payment_ref" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- -----------------------------------------------------------------------------
-- INDEXES
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_status_idx" ON "users"("status");
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
CREATE INDEX "tutor_services_service_id_idx" ON "tutor_services"("service_id");
CREATE INDEX "availability_rules_tutor_id_weekday_idx" ON "availability_rules"("tutor_id", "weekday");
CREATE INDEX "availability_exceptions_tutor_id_starts_at_idx" ON "availability_exceptions"("tutor_id", "starts_at");
CREATE INDEX "bookings_tutor_id_starts_at_idx" ON "bookings"("tutor_id", "starts_at");
CREATE INDEX "bookings_student_id_starts_at_idx" ON "bookings"("student_id", "starts_at");
CREATE INDEX "bookings_status_starts_at_idx" ON "bookings"("status", "starts_at");
CREATE INDEX "session_feed_posts_booking_id_created_at_idx" ON "session_feed_posts"("booking_id", "created_at");
CREATE INDEX "groups_owner_id_idx" ON "groups"("owner_id");
CREATE INDEX "group_members_user_id_idx" ON "group_members"("user_id");
CREATE INDEX "resources_owner_id_idx" ON "resources"("owner_id");
CREATE INDEX "resource_assignments_student_id_idx" ON "resource_assignments"("student_id");
CREATE INDEX "resource_assignments_group_id_idx" ON "resource_assignments"("group_id");
CREATE UNIQUE INDEX "resource_assignments_resource_id_student_id_key" ON "resource_assignments"("resource_id", "student_id");
CREATE UNIQUE INDEX "resource_assignments_resource_id_group_id_key" ON "resource_assignments"("resource_id", "group_id");
CREATE INDEX "email_outbox_status_send_after_idx" ON "email_outbox"("status", "send_after");
CREATE UNIQUE INDEX "plans_key_key" ON "plans"("key");
CREATE UNIQUE INDEX "subscriptions_provider_subscription_ref_key" ON "subscriptions"("provider_subscription_ref");
CREATE INDEX "subscriptions_user_id_status_idx" ON "subscriptions"("user_id", "status");
CREATE UNIQUE INDEX "payments_provider_payment_ref_key" ON "payments"("provider_payment_ref");
CREATE INDEX "payments_user_id_created_at_idx" ON "payments"("user_id", "created_at");
CREATE UNIQUE INDEX "billing_events_provider_event_id_key" ON "billing_events"("provider", "event_id");

-- -----------------------------------------------------------------------------
-- FOREIGN KEYS
-- -----------------------------------------------------------------------------
ALTER TABLE "users" ADD CONSTRAINT "users_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tutor_services" ADD CONSTRAINT "tutor_services_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_services" ADD CONSTRAINT "tutor_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "session_feed_posts" ADD CONSTRAINT "session_feed_posts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "session_feed_posts" ADD CONSTRAINT "session_feed_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resources" ADD CONSTRAINT "resources_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- EXTRA INTEGRITY (not representable in schema.prisma)
-- =============================================================================

-- Sanity checks on scheduling data.
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_weekday_chk" CHECK ("weekday" BETWEEN 1 AND 7);
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_minutes_chk"
  CHECK ("start_minute" >= 0 AND "end_minute" <= 1440 AND "start_minute" < "end_minute");
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_range_chk" CHECK ("starts_at" < "ends_at");
ALTER TABLE "services" ADD CONSTRAINT "services_duration_chk" CHECK ("duration_minutes" > 0 AND "buffer_minutes" >= 0);
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_range_chk"
  CHECK ("starts_at" < "ends_at" AND "ends_at" <= "blocked_until");
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_distinct_people_chk" CHECK ("student_id" <> "tutor_id");

-- The hard guarantee against double-booking. Even if two requests race past
-- the application-level availability check, PostgreSQL rejects the second
-- insert with SQLSTATE 23P01 (mapped to HTTP 409 by the API).
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_tutor_overlap"
  EXCLUDE USING gist ("tutor_id" WITH =, tstzrange("starts_at", "blocked_until", '[)') WITH &&)
  WHERE ("status" IN ('PENDING', 'CONFIRMED'));

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_student_overlap"
  EXCLUDE USING gist ("student_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("status" IN ('PENDING', 'CONFIRMED'));

-- A resource assignment targets exactly one student OR one group.
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_target_chk"
  CHECK (num_nonnulls("student_id", "group_id") = 1);

-- Resources: files need a storage key, links/videos need a URL.
ALTER TABLE "resources" ADD CONSTRAINT "resources_payload_chk"
  CHECK (("type" = 'FILE' AND "storage_key" IS NOT NULL) OR ("type" <> 'FILE' AND "url" IS NOT NULL));
