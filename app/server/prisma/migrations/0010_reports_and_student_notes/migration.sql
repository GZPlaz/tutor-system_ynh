-- =============================================================================
-- 0010 — reports about tutors, tutors' notes about students
-- Additive only.
-- =============================================================================

-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('SAFETY', 'CONDUCT', 'NO_SHOW', 'QUALITY', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "NoteVisibility" AS ENUM ('SHARED', 'TUTORS_ONLY');

-- CreateTable
CREATE TABLE "tutor_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tutor_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "booking_id" UUID,
    "category" "ReportCategory" NOT NULL,
    "details" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "admin_note" TEXT,
    "handled_by_id" UUID,
    "handled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tutor_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'TUTORS_ONLY',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tutor_reports_status_created_at_idx" ON "tutor_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "tutor_reports_tutor_id_idx" ON "tutor_reports"("tutor_id");

-- CreateIndex
CREATE INDEX "student_notes_student_id_created_at_idx" ON "student_notes"("student_id", "created_at");

-- AddForeignKey
ALTER TABLE "tutor_reports" ADD CONSTRAINT "tutor_reports_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_reports" ADD CONSTRAINT "tutor_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_reports" ADD CONSTRAINT "tutor_reports_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_reports" ADD CONSTRAINT "tutor_reports_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "tutor_reports" ADD CONSTRAINT "tutor_reports_details_chk" CHECK (char_length("details") BETWEEN 10 AND 4000);
ALTER TABLE "tutor_reports" ADD CONSTRAINT "tutor_reports_not_self_chk" CHECK ("tutor_id" <> "reporter_id");
ALTER TABLE "tutor_reports" ADD CONSTRAINT "tutor_reports_note_chk" CHECK ("admin_note" IS NULL OR char_length("admin_note") <= 4000);
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_body_chk" CHECK (char_length("body") BETWEEN 1 AND 4000);
