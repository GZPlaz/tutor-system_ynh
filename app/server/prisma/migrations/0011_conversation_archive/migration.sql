-- 0011 — per-person archiving of conversations. Additive only.
ALTER TABLE "conversations" ADD COLUMN "student_archived_at" TIMESTAMPTZ(3);
ALTER TABLE "conversations" ADD COLUMN "tutor_archived_at" TIMESTAMPTZ(3);
