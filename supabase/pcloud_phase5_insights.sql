-- ============================================================
-- pCloud Intelligence System - Phase 5 dashboard indexes
-- Run after the base pcloud schema is applied.
-- ============================================================

CREATE INDEX IF NOT EXISTS pcloud_fr_indexed_at_desc_idx
ON pcloud_file_records (indexed_at DESC);

CREATE INDEX IF NOT EXISTS pcloud_fr_relative_path_idx_v2
ON pcloud_file_records (relative_path);

CREATE INDEX IF NOT EXISTS pcloud_fu_detected_client_idx
ON pcloud_file_understandings (detected_client);

CREATE INDEX IF NOT EXISTS pcloud_fu_detected_project_idx
ON pcloud_file_understandings (detected_project);

CREATE INDEX IF NOT EXISTS pcloud_fu_detected_document_type_idx
ON pcloud_file_understandings (detected_document_type);

CREATE INDEX IF NOT EXISTS pcloud_fu_understanding_level_idx_v2
ON pcloud_file_understandings (understanding_level);

CREATE INDEX IF NOT EXISTS pcloud_fu_review_confidence_idx
ON pcloud_file_understandings (requires_review, confidence_score);

CREATE INDEX IF NOT EXISTS pcloud_rq_status_reason_created_idx
ON pcloud_review_queue (status, review_reason, created_at DESC);

CREATE INDEX IF NOT EXISTS pcloud_pe_error_type_created_idx
ON pcloud_processing_errors (error_type, created_at DESC);
