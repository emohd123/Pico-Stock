-- ============================================================
-- pCloud Intelligence System - Phase 5 dashboard aggregate views
-- Apply this in Supabase SQL Editor for production-scale dashboard speed.
-- ============================================================

CREATE OR REPLACE VIEW pcloud_insight_clients_total AS
SELECT
  COALESCE(detected_client, 'Unassigned') AS label,
  COUNT(*)::BIGINT AS value
FROM pcloud_file_understandings
GROUP BY 1;

CREATE OR REPLACE VIEW pcloud_insight_clients_recent AS
SELECT
  COALESCE(detected_client, 'Unassigned') AS label,
  COUNT(*)::BIGINT AS value
FROM pcloud_file_understandings
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1;

CREATE OR REPLACE VIEW pcloud_insight_clients_understood AS
SELECT
  COALESCE(detected_client, 'Unassigned') AS label,
  COUNT(*)::BIGINT AS value
FROM pcloud_file_understandings
WHERE understanding_level IN ('content_understood', 'filename_path_inferred')
GROUP BY 1;

CREATE OR REPLACE VIEW pcloud_insight_trends_monthly AS
SELECT
  TO_CHAR(DATE_TRUNC('month', indexed_at), 'YYYY-MM') AS key,
  TO_CHAR(DATE_TRUNC('month', indexed_at), 'Mon YYYY') AS label,
  EXTRACT(YEAR FROM DATE_TRUNC('month', indexed_at)) * 100 + EXTRACT(MONTH FROM DATE_TRUNC('month', indexed_at)) AS sort_key,
  COUNT(*)::BIGINT AS value
FROM pcloud_file_records
WHERE is_active = TRUE
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW pcloud_insight_trends_yearly AS
SELECT
  TO_CHAR(DATE_TRUNC('year', indexed_at), 'YYYY') AS label,
  EXTRACT(YEAR FROM DATE_TRUNC('year', indexed_at))::INT AS sort_key,
  COUNT(*)::BIGINT AS value
FROM pcloud_file_records
WHERE is_active = TRUE
GROUP BY 1, 2;

CREATE OR REPLACE VIEW pcloud_insight_trends_recent_daily AS
SELECT
  TO_CHAR(DATE_TRUNC('day', indexed_at), 'YYYY-MM-DD') AS label,
  TO_CHAR(DATE_TRUNC('day', indexed_at), 'YYYYMMDD')::BIGINT AS sort_key,
  COUNT(*)::BIGINT AS value
FROM pcloud_file_records
WHERE is_active = TRUE
  AND indexed_at >= NOW() - INTERVAL '28 days'
GROUP BY 1, 2;

CREATE OR REPLACE VIEW pcloud_insight_document_distribution AS
SELECT
  CASE
    WHEN LOWER(COALESCE(u.detected_document_type, '')) LIKE '%quote%' OR LOWER(COALESCE(u.detected_document_type, '')) LIKE '%quotation%' THEN 'quotation'
    WHEN LOWER(COALESCE(u.detected_document_type, '')) LIKE '%contract%' THEN 'contract'
    WHEN LOWER(COALESCE(u.detected_document_type, '')) LIKE '%render%' THEN 'render'
    WHEN LOWER(COALESCE(u.detected_document_type, '')) LIKE '%presentation%' OR fr.extension IN ('ppt', 'pptx') THEN 'presentation'
    WHEN LOWER(COALESCE(u.detected_document_type, '')) LIKE '%spreadsheet%' OR fr.extension IN ('xls', 'xlsx', 'csv') THEN 'spreadsheet'
    WHEN fr.extension IN ('jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff') THEN 'image'
    WHEN fr.extension IN ('mp3', 'wav', 'm4a', 'ogg', 'flac') THEN 'audio'
    WHEN fr.extension IN ('mp4', 'mov', 'avi', 'mkv', 'webm', 'vob') THEN 'video'
    ELSE 'unknown'
  END AS label,
  COUNT(*)::BIGINT AS value
FROM pcloud_file_records fr
LEFT JOIN pcloud_file_understandings u ON u.file_record_id = fr.id
WHERE fr.is_active = TRUE
GROUP BY 1;

CREATE OR REPLACE VIEW pcloud_insight_understanding_distribution AS
SELECT
  COALESCE(understanding_level, 'metadata_only') AS label,
  COUNT(*)::BIGINT AS value
FROM pcloud_file_understandings
GROUP BY 1;

CREATE OR REPLACE VIEW pcloud_insight_root_areas AS
SELECT
  COALESCE(NULLIF(SPLIT_PART(relative_path, '/', 1), ''), '(root)') AS label,
  COUNT(*)::BIGINT AS value
FROM pcloud_file_records
WHERE is_active = TRUE
GROUP BY 1;

CREATE OR REPLACE VIEW pcloud_insight_folder_prefixes AS
SELECT
  COALESCE(NULLIF(parent_path, ''), '(root)') AS label,
  COUNT(*)::BIGINT AS value
FROM pcloud_file_records
WHERE is_active = TRUE
GROUP BY 1;

CREATE OR REPLACE VIEW pcloud_insight_project_areas AS
SELECT
  COALESCE(NULLIF(u.detected_project, ''), COALESCE(NULLIF(SPLIT_PART(fr.relative_path, '/', 1), ''), '(root)')) AS label,
  COUNT(*)::BIGINT AS value
FROM pcloud_file_records fr
LEFT JOIN pcloud_file_understandings u ON u.file_record_id = fr.id
WHERE fr.is_active = TRUE
GROUP BY 1;

CREATE OR REPLACE VIEW pcloud_insight_review_backlog AS
SELECT
  COALESCE(status, 'pending') AS label,
  COUNT(*)::BIGINT AS value
FROM pcloud_review_queue
GROUP BY 1;

CREATE OR REPLACE VIEW pcloud_insight_review_reasons AS
SELECT
  COALESCE(review_reason, 'unknown') AS label,
  COUNT(*)::BIGINT AS value
FROM pcloud_review_queue
GROUP BY 1;

CREATE OR REPLACE VIEW pcloud_insight_review_folders AS
SELECT
  COALESCE(NULLIF(SPLIT_PART(fr.relative_path, '/', 1), ''), '(root)') AS label,
  COUNT(*)::BIGINT AS value
FROM pcloud_review_queue rq
JOIN pcloud_file_records fr ON fr.id = rq.file_record_id
GROUP BY 1;

CREATE OR REPLACE VIEW pcloud_insight_low_confidence_trend AS
SELECT
  TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS key,
  TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS label,
  EXTRACT(YEAR FROM DATE_TRUNC('month', created_at)) * 100 + EXTRACT(MONTH FROM DATE_TRUNC('month', created_at)) AS sort_key,
  COUNT(*)::BIGINT AS value
FROM pcloud_review_queue
WHERE confidence_score < 0.6
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW pcloud_insight_duplicate_candidates AS
WITH grouped AS (
  SELECT
    COALESCE(NULLIF(SPLIT_PART(relative_path, '/', 1), ''), '(root)') AS area,
    LOWER(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(filename, '\.[^.]+$', ''),
          '(\brev\b|\br\b|\bv\b)[0-9]+',
          '',
          'gi'
        ),
        '[_\-.]+',
        ' ',
        'g'
      )
    ) AS normalized_name,
    ROUND(COALESCE(size_bytes, 0) / 10240.0) AS size_bucket,
    COUNT(*)::BIGINT AS candidate_count,
    MIN(id) AS sample_file_id_1,
    MIN(filename) AS sample_file_1,
    MIN(relative_path) AS sample_path_1,
    (ARRAY_AGG(id ORDER BY id))[2] AS sample_file_id_2,
    (ARRAY_AGG(filename ORDER BY id))[2] AS sample_file_2,
    (ARRAY_AGG(relative_path ORDER BY id))[2] AS sample_path_2,
    (ARRAY_AGG(id ORDER BY id))[3] AS sample_file_id_3,
    (ARRAY_AGG(filename ORDER BY id))[3] AS sample_file_3,
    (ARRAY_AGG(relative_path ORDER BY id))[3] AS sample_path_3
  FROM pcloud_file_records
  WHERE is_active = TRUE
  GROUP BY 1, 2, 3
)
SELECT *
FROM grouped
WHERE candidate_count > 1;

CREATE OR REPLACE VIEW pcloud_insight_ignored_files AS
SELECT
  LOWER(COALESCE(NULLIF(extension, ''), filename)) AS label,
  COUNT(*)::BIGINT AS value
FROM pcloud_file_records
WHERE is_active = TRUE
  AND (
    LOWER(extension) IN ('db', 'bup', 'ini', 'ds_store', 'tmp', 'temp', 'dat', 'bak', 'log')
    OR LOWER(filename) IN ('thumbs.db', 'desktop.ini', '.pcloud', '.tmp')
  )
GROUP BY 1;

CREATE OR REPLACE VIEW pcloud_insight_error_types AS
SELECT
  COALESCE(error_type, 'unknown') AS label,
  COUNT(*)::BIGINT AS value
FROM pcloud_processing_errors
GROUP BY 1;

CREATE OR REPLACE VIEW pcloud_insight_extraction_failures AS
SELECT
  COALESCE(extraction_type, 'unknown') AS label,
  COUNT(*)::BIGINT AS value
FROM pcloud_extracted_contents
WHERE extraction_status IS NOT NULL
  AND extraction_status NOT IN ('completed', 'skipped')
GROUP BY 1;
