-- Phase 6: pCloud intelligence quality hardening
-- These are recommended DB updates to make classification persistence and
-- dashboard grouping more reliable at production scale.

CREATE INDEX IF NOT EXISTS pcloud_fr_relative_path_lower_idx
ON pcloud_file_records ((lower(relative_path)));

CREATE INDEX IF NOT EXISTS pcloud_fu_level_client_project_idx
ON pcloud_file_understandings (understanding_level, detected_client, detected_project);

CREATE INDEX IF NOT EXISTS pcloud_fu_doc_type_review_idx
ON pcloud_file_understandings (detected_document_type, requires_review, confidence_score);

CREATE INDEX IF NOT EXISTS pcloud_rq_file_status_idx
ON pcloud_review_queue (file_record_id, status, created_at DESC);

-- Optional hardening after duplicate cleanup:
-- 1. Deduplicate pcloud_file_records by relative_path, keeping the newest row.
-- 2. Repoint understandings / extracted contents / review items to the kept file_record_id.
-- 3. Then add the uniqueness constraints below.
--
-- CREATE UNIQUE INDEX pcloud_fr_relative_path_unique
-- ON pcloud_file_records (relative_path);
--
-- CREATE UNIQUE INDEX pcloud_fu_file_record_unique
-- ON pcloud_file_understandings (file_record_id);
--
-- CREATE UNIQUE INDEX pcloud_ec_file_record_unique
-- ON pcloud_extracted_contents (file_record_id);
--
-- CREATE UNIQUE INDEX pcloud_rq_pending_unique
-- ON pcloud_review_queue (file_record_id)
-- WHERE status = 'pending';
