/**
 * worker/scanner.js — Recursive file scanner with batching.
 * Yields arrays of file metadata in batches to avoid memory overload.
 */

const fs = require('fs');
const path = require('path');

// Folders to always skip
const SKIP_FOLDERS = new Set([
    'node_modules', '.git', '.next', '__pycache__', '.DS_Store',
    '$RECYCLE.BIN', 'System Volume Information', '.Trash',
    'Thumbs.db', '.pcloud', '.tmp', 'desktop.ini',
]);

/**
 * Recursively scan a directory and yield files in batches.
 * @param {string} rootPath — absolute root path (e.g. P:\)
 * @param {object} options — { batchSize, maxFiles }
 * @returns {Array<Array<FileInfo>>} — array of batches
 */
function scanInBatches(rootPath, options = {}) {
    const batchSize = options.batchSize || 100;
    const maxFiles = options.maxFiles || 500000;
    const relativeRoot = options.rootForRelative || rootPath;
    const batches = [];
    let currentBatch = [];
    let totalFound = 0;

    function walk(dir) {
        if (totalFound >= maxFiles) return;

        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            // Permission denied or path doesn't exist — skip silently
            return;
        }

        for (const entry of entries) {
            if (totalFound >= maxFiles) break;

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                const nameLower = entry.name.toLowerCase();
                if (SKIP_FOLDERS.has(entry.name) || SKIP_FOLDERS.has(nameLower)) continue;
                if (entry.name.startsWith('.')) continue; // Skip hidden folders
                walk(fullPath);
            } else if (entry.isFile()) {
                try {
                    const stat = fs.statSync(fullPath);
                    const ext = path.extname(entry.name).replace(/^\./, '').toLowerCase();

                    // Normalize relative path with forward slashes
                    const relativePath = path.relative(relativeRoot, fullPath).split(path.sep).join('/');
                    const parentPath = path.relative(relativeRoot, dir).split(path.sep).join('/');

                    currentBatch.push({
                        filename: entry.name,
                        extension: ext,
                        absolutePath: fullPath,
                        relativePath: relativePath,
                        parentPath: parentPath || '',
                        sizeBytes: stat.size,
                        createdAtSource: stat.birthtime.toISOString(),
                        updatedAtSource: stat.mtime.toISOString(),
                    });

                    totalFound++;

                    if (currentBatch.length >= batchSize) {
                        batches.push(currentBatch);
                        currentBatch = [];
                    }
                } catch {
                    // Can't stat this file — skip
                }
            }
        }
    }

    walk(rootPath);

    // Push remaining files as final batch
    if (currentBatch.length > 0) {
        batches.push(currentBatch);
    }

    return { batches, totalFound };
}

module.exports = { scanInBatches };
