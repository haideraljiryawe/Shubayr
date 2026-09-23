-- Durable media metadata. Existing category/product/banner URLs remain valid;
-- no backfill is required. Rollback must first replace any URLs that point at
-- /media/{id}, then DROP TABLE media_objects. MinIO objects are intentionally
-- retained during rollback so application rollback cannot destroy media.
CREATE TABLE "media_objects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "object_key" VARCHAR(512) NOT NULL,
    "public_url" TEXT NOT NULL,
    "mime_type" VARCHAR(80) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_objects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "media_objects_size_positive" CHECK ("size_bytes" > 0)
);

CREATE UNIQUE INDEX "media_objects_object_key_key" ON "media_objects"("object_key");
CREATE UNIQUE INDEX "media_objects_public_url_key" ON "media_objects"("public_url");
CREATE INDEX "idx_media_objects_uploader" ON "media_objects"("uploaded_by");

ALTER TABLE "media_objects" ADD CONSTRAINT "media_objects_uploaded_by_fkey"
  FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
