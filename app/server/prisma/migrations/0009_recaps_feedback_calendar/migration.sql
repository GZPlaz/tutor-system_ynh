-- =============================================================================
-- 0009 — session recaps, session feedback, personal calendar feeds
-- Additive only.
-- =============================================================================

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "recap" TEXT,
ADD COLUMN     "recap_posted_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "calendar_key" TEXT;

-- CreateTable
CREATE TABLE "session_feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "session_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_feedback_booking_id_key" ON "session_feedback"("booking_id");

-- CreateIndex
CREATE INDEX "session_feedback_student_id_idx" ON "session_feedback"("student_id");

-- AddForeignKey
ALTER TABLE "session_feedback" ADD CONSTRAINT "session_feedback_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_feedback" ADD CONSTRAINT "session_feedback_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "session_feedback" ADD CONSTRAINT "session_feedback_rating_chk" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "session_feedback" ADD CONSTRAINT "session_feedback_comment_chk" CHECK ("comment" IS NULL OR char_length("comment") <= 1000);
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_recap_length_chk" CHECK ("recap" IS NULL OR char_length("recap") <= 4000);
