-- ============================================================
-- pCloud — Post-Reclassify Review Reconciliation
-- Run this in Supabase Dashboard → SQL Editor AFTER every
-- reclassify command completes.
-- ============================================================
-- Safe to run multiple times (idempotent).
-- Makes NO changes to the source P:\ drive files.
-- ============================================================

-- ── Step 1: Pull understanding_level out of 'needs_review'
-- for records whose requires_review flag was cleared to false
-- (i.e. the reclassify run raised their confidence).
-- Without this, understanding_level = 'needs_review' persists even
-- though the classifier no longer flags the file.
UPDATE pcloud_file_understandings u
SET
    understanding_level = CASE
        WHEN confidence_score >= 0.56 THEN 'filename_path_inferred'
        WHEN confidence_score >= 0.48
             AND (detected_client IS NOT NULL
                  OR detected_project IS NOT NULL
                  OR detected_document_type IS NOT NULL) THEN 'filename_path_inferred'
        ELSE 'metadata_only'
    END,
    updated_at = NOW()
WHERE
    u.understanding_level = 'needs_review'
    AND u.requires_review = false;

-- ── Step 2: Resolve stale 'pending' review-queue items
-- for files whose understanding was auto-improved.
-- This covers cases where the reclassify loop exited early (e.g. network
-- retry exhausted a batch) and resolvePendingReviewItemsForFileIds was
-- never called for those file IDs.
UPDATE pcloud_review_queue rq
SET
    status      = 'resolved',
    reviewed_at = NOW(),
    reviewed_by = 'system_reconcile'
WHERE
    rq.status = 'pending'
    AND EXISTS (
        SELECT 1
        FROM pcloud_file_understandings u
        WHERE u.file_record_id = rq.file_record_id
          AND u.requires_review = false
    );

-- ── Step 3: Remove orphaned understanding rows
-- (understanding exists but the file record is gone or inactive).
-- These inflate all understanding-level KPIs.
DELETE FROM pcloud_file_understandings u
WHERE NOT EXISTS (
    SELECT 1
    FROM pcloud_file_records r
    WHERE r.id = u.file_record_id
      AND r.is_active = true
);

-- ── Step 4: Diagnostic summary — run this last to verify counts.
SELECT
    understanding_level,
    COUNT(*)            AS file_count,
    ROUND(AVG(confidence_score)::numeric, 3) AS avg_confidence,
    SUM(CASE WHEN requires_review THEN 1 ELSE 0 END) AS flagged_for_review
FROM pcloud_file_understandings
GROUP BY understanding_level
ORDER BY file_count DESC;
