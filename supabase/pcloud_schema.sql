-- ============================================================
-- pCloud Intelligence System — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- FILE RECORDS — core inventory of every indexed file
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pcloud_file_records (
    id              TEXT        PRIMARY KEY,
    filename        TEXT        NOT NULL,
    extension       TEXT        NOT NULL DEFAULT '',
    mime_type       TEXT        NOT NULL DEFAULT 'application/octet-stream',
    size_bytes      BIGINT      NOT NULL DEFAULT 0,
    checksum        TEXT,
    absolute_path   TEXT,
    relative_path   TEXT        NOT NULL,
    parent_path     TEXT        NOT NULL DEFAULT '',
    source_type     TEXT        NOT NULL DEFAULT 'pcloud_sync',
    source_status   TEXT        NOT NULL DEFAULT 'active',
    indexed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at_source TIMESTAMPTZ,
    updated_at_source TIMESTAMPTZ,
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active       BOOLEAN     NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS pcloud_fr_extension_idx    ON pcloud_file_records (extension);
CREATE INDEX IF NOT EXISTS pcloud_fr_parent_path_idx  ON pcloud_file_records (parent_path);
CREATE INDEX IF NOT EXISTS pcloud_fr_source_status_idx ON pcloud_file_records (source_status);
CREATE INDEX IF NOT EXISTS pcloud_fr_is_active_idx    ON pcloud_file_records (is_active);

-- ────────────────────────────────────────────────────────────
-- FILE UNDERSTANDINGS — AI-inferred metadata per file
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pcloud_file_understandings (
    id                      TEXT        PRIMARY KEY,
    file_record_id          TEXT        NOT NULL REFERENCES pcloud_file_records(id) ON DELETE CASCADE,
    understanding_level     TEXT        NOT NULL DEFAULT 'metadata_only',
    detected_client         TEXT,
    detected_project        TEXT,
    detected_campaign       TEXT,
    detected_department     TEXT,
    detected_document_type  TEXT,
    detected_document_subtype TEXT,
    detected_year           INTEGER,
    detected_month          INTEGER,
    detected_location       TEXT,
    detected_media_type     TEXT,
    detected_version        TEXT,
    detected_status         TEXT,
    short_summary           TEXT,
    extracted_text_preview  TEXT,
    confidence_score        NUMERIC     NOT NULL DEFAULT 0,
    confidence_reason       TEXT,
    classifier_version      TEXT        NOT NULL DEFAULT 'v1.0',
    requires_review         BOOLEAN     NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pcloud_fu_file_record_idx    ON pcloud_file_understandings (file_record_id);
CREATE INDEX IF NOT EXISTS pcloud_fu_understanding_idx  ON pcloud_file_understandings (understanding_level);
CREATE INDEX IF NOT EXISTS pcloud_fu_confidence_idx     ON pcloud_file_understandings (confidence_score);
CREATE INDEX IF NOT EXISTS pcloud_fu_requires_review_idx ON pcloud_file_understandings (requires_review);

-- ────────────────────────────────────────────────────────────
-- EXTRACTED CONTENTS — raw and cleaned text per file
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pcloud_extracted_contents (
    id                TEXT        PRIMARY KEY,
    file_record_id    TEXT        NOT NULL REFERENCES pcloud_file_records(id) ON DELETE CASCADE,
    extraction_type   TEXT        NOT NULL DEFAULT 'text',
    raw_text          TEXT,
    cleaned_text      TEXT,
    preview_text      TEXT,
    language          TEXT,
    page_count        INTEGER,
    duration_seconds  NUMERIC,
    extraction_status TEXT        NOT NULL DEFAULT 'pending',
    extraction_notes  TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pcloud_ec_file_record_idx ON pcloud_extracted_contents (file_record_id);

-- ────────────────────────────────────────────────────────────
-- REVIEW QUEUE — files that need human review
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pcloud_review_queue (
    id                  TEXT        PRIMARY KEY,
    file_record_id      TEXT        NOT NULL REFERENCES pcloud_file_records(id) ON DELETE CASCADE,
    review_reason       TEXT        NOT NULL DEFAULT 'low_confidence',
    suggested_labels    JSONB       NOT NULL DEFAULT '{}',
    confidence_score    NUMERIC     NOT NULL DEFAULT 0,
    status              TEXT        NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at         TIMESTAMPTZ,
    reviewed_by         TEXT
);

CREATE INDEX IF NOT EXISTS pcloud_rq_status_idx      ON pcloud_review_queue (status);
CREATE INDEX IF NOT EXISTS pcloud_rq_file_record_idx ON pcloud_review_queue (file_record_id);

-- ────────────────────────────────────────────────────────────
-- PROCESSING JOBS — batch indexing job tracking
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pcloud_processing_jobs (
    id              TEXT        PRIMARY KEY,
    job_type        TEXT        NOT NULL DEFAULT 'scan',
    status          TEXT        NOT NULL DEFAULT 'running',
    root_path       TEXT,
    total_files     INTEGER     NOT NULL DEFAULT 0,
    processed_files INTEGER     NOT NULL DEFAULT 0,
    error_count     INTEGER     NOT NULL DEFAULT 0,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    notes           TEXT
);

-- ────────────────────────────────────────────────────────────
-- PROCESSING ERRORS — per-file error log
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pcloud_processing_errors (
    id              TEXT        PRIMARY KEY,
    job_id          TEXT        REFERENCES pcloud_processing_jobs(id) ON DELETE SET NULL,
    file_record_id  TEXT        REFERENCES pcloud_file_records(id) ON DELETE SET NULL,
    file_path       TEXT,
    error_type      TEXT        NOT NULL DEFAULT 'unknown',
    error_message   TEXT        NOT NULL DEFAULT '',
    stack_trace     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pcloud_pe_job_idx ON pcloud_processing_errors (job_id);

-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────
ALTER TABLE pcloud_file_records        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcloud_file_understandings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcloud_extracted_contents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcloud_review_queue        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcloud_processing_jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcloud_processing_errors   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_pcloud_file_records"        ON pcloud_file_records        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pcloud_file_understandings" ON pcloud_file_understandings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pcloud_extracted_contents"  ON pcloud_extracted_contents  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pcloud_review_queue"        ON pcloud_review_queue        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pcloud_processing_jobs"     ON pcloud_processing_jobs     FOR ALL TO service_role USING (true) WITH CHECK (true);
-- ────────────────────────────────────────────────────────────
-- PERFORMANCE INDEXES (Trigram for partial text matching)
-- ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- File Records search
CREATE INDEX IF NOT EXISTS pcloud_fr_filename_trgm_idx ON pcloud_file_records USING GIN (filename gin_trgm_ops);
CREATE INDEX IF NOT EXISTS pcloud_fr_relative_path_trgm_idx ON pcloud_file_records USING GIN (relative_path gin_trgm_ops);

-- AI Understandings search
CREATE INDEX IF NOT EXISTS pcloud_fu_detected_client_trgm_idx ON pcloud_file_understandings USING GIN (detected_client gin_trgm_ops);
CREATE INDEX IF NOT EXISTS pcloud_fu_detected_project_trgm_idx ON pcloud_file_understandings USING GIN (detected_project gin_trgm_ops);
CREATE INDEX IF NOT EXISTS pcloud_fu_detected_document_type_trgm_idx ON pcloud_file_understandings USING GIN (detected_document_type gin_trgm_ops);
CREATE INDEX IF NOT EXISTS pcloud_fu_short_summary_trgm_idx ON pcloud_file_understandings USING GIN (short_summary gin_trgm_ops);

-- Extracted Text search
CREATE INDEX IF NOT EXISTS pcloud_ec_cleaned_text_trgm_idx ON pcloud_extracted_contents USING GIN (cleaned_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS pcloud_ec_preview_text_trgm_idx ON pcloud_extracted_contents USING GIN (preview_text gin_trgm_ops);

