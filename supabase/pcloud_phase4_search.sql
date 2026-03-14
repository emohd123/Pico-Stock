-- ============================================================
-- pCloud Intelligence System — Phase 4 Search indexes
-- Run this after pcloud_schema.sql in Supabase SQL Editor.
-- Read-only search support only. No file data is mutated here.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS pcloud_fr_filename_trgm_idx
ON pcloud_file_records
USING GIN (filename gin_trgm_ops);

CREATE INDEX IF NOT EXISTS pcloud_fr_relative_path_trgm_idx
ON pcloud_file_records
USING GIN (relative_path gin_trgm_ops);

CREATE INDEX IF NOT EXISTS pcloud_fu_client_trgm_idx
ON pcloud_file_understandings
USING GIN (detected_client gin_trgm_ops);

CREATE INDEX IF NOT EXISTS pcloud_fu_project_trgm_idx
ON pcloud_file_understandings
USING GIN (detected_project gin_trgm_ops);

CREATE INDEX IF NOT EXISTS pcloud_fu_document_type_trgm_idx
ON pcloud_file_understandings
USING GIN (detected_document_type gin_trgm_ops);

CREATE INDEX IF NOT EXISTS pcloud_fu_summary_trgm_idx
ON pcloud_file_understandings
USING GIN (short_summary gin_trgm_ops);

CREATE INDEX IF NOT EXISTS pcloud_ec_preview_trgm_idx
ON pcloud_extracted_contents
USING GIN (preview_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS pcloud_fr_indexed_at_idx
ON pcloud_file_records (indexed_at DESC);
