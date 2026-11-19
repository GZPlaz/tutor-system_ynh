-- =============================================================================
-- 0006 — free study packets (public /packets page)
-- Additive only: one new table. The bundled ACT packets are added by the app
-- itself on first start (they need their PDF copied into UPLOAD_DIR).
-- =============================================================================

CREATE TABLE "study_packets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT NOT NULL,
    "page_count" INTEGER,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "seed_key" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "study_packets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "study_packets_page_count_chk" CHECK ("page_count" IS NULL OR "page_count" > 0)
);

CREATE UNIQUE INDEX "study_packets_seed_key_key" ON "study_packets"("seed_key");
CREATE INDEX "study_packets_is_published_subject_idx" ON "study_packets"("is_published", "subject");

ALTER TABLE "study_packets" ADD CONSTRAINT "study_packets_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
