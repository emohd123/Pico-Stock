/**
 * worker/incremental.js — Skip-unchanged logic for incremental indexing.
 * Queries Supabase for existing records and compares size + mtime.
 */

const db = require('./db');

/**
 * Decide whether a file needs reprocessing.
 * @param {object} fileInfo — { relativePath, sizeBytes, updatedAtSource }
 * @returns {{ action: 'skip'|'new'|'update', existingId: string|null }}
 */
async function checkIncremental(fileInfo) {
    const existing = await db.getExistingRecordByPath(fileInfo.relativePath);

    if (!existing) {
        return { action: 'new', existingId: null };
    }

    // Compare size and modification time
    const sameSize = existing.sizeBytes === fileInfo.sizeBytes;
    const sameMtime = existing.updatedAtSource === fileInfo.updatedAtSource;

    if (sameSize && sameMtime) {
        // File unchanged — just touch last_seen_at
        await db.touchLastSeen(existing.id);
        return { action: 'skip', existingId: existing.id };
    }

    // File changed — needs reprocessing
    return { action: 'update', existingId: existing.id };
}

module.exports = { checkIncremental };
