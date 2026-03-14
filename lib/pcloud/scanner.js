/**
 * StorageScanner — recursively enumerate files under a root path.
 * Uses Node.js fs/path APIs. Falls back to demo data when drive unavailable.
 */

import fs from 'fs';
import path from 'path';
import { resolveFileType } from './fileTypeResolver';

const SOURCE_ROOT = process.env.PCLOUD_SOURCE_ROOT || 'P:\\';

// Max files per scan to prevent runaway jobs
const MAX_FILES = parseInt(process.env.PCLOUD_MAX_FILES || '500000', 10);

// Folders to skip
const SKIP_FOLDERS = new Set([
    'node_modules', '.git', '.next', '__pycache__', '.DS_Store',
    '$RECYCLE.BIN', 'System Volume Information', '.Trash',
]);

/**
 * Check if the source root is accessible.
 */
export function isSourceAvailable() {
    try {
        fs.accessSync(SOURCE_ROOT, fs.constants.R_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get the configured source root path.
 */
export function getSourceRoot() {
    return SOURCE_ROOT;
}

/**
 * Recursively scan a directory and return file metadata objects.
 * @param {string} rootPath — absolute path to scan from
 * @param {object} options — { maxFiles, onProgress }
 * @returns {Array<{ filename, extension, absolutePath, relativePath, parentPath, sizeBytes, createdAtSource, updatedAtSource, mimeType, mediaCategory }>}
 */
export function scanDirectory(rootPath = SOURCE_ROOT, options = {}) {
    const maxFiles = options.maxFiles || MAX_FILES;
    const results = [];

    function walk(dir) {
        if (results.length >= maxFiles) return;

        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            // Permission denied or path doesn't exist
            return;
        }

        for (const entry of entries) {
            if (results.length >= maxFiles) break;

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                if (SKIP_FOLDERS.has(entry.name)) continue;
                walk(fullPath);
            } else if (entry.isFile()) {
                try {
                    const stat = fs.statSync(fullPath);
                    const ext = path.extname(entry.name).replace(/^\./, '').toLowerCase();
                    const typeInfo = resolveFileType(ext);

                    // Normalize paths: use forward slashes for storage
                    const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');
                    const parentPath = path.relative(rootPath, dir).replace(/\\/g, '/');

                    results.push({
                        filename:        entry.name,
                        extension:       ext,
                        absolutePath:    fullPath,
                        relativePath:    relativePath,
                        parentPath:      parentPath || '',
                        sizeBytes:       stat.size,
                        createdAtSource: stat.birthtime.toISOString(),
                        updatedAtSource: stat.mtime.toISOString(),
                        mimeType:        typeInfo.mime,
                        mediaCategory:   typeInfo.category,
                        extractable:     typeInfo.extractable,
                    });
                } catch {
                    // Skip files we can't stat
                }
            }
        }
    }

    walk(rootPath);
    return results;
}

/**
 * Get metadata for a single file.
 */
export function getFileMetadata(absolutePath) {
    try {
        const stat = fs.statSync(absolutePath);
        const ext = path.extname(absolutePath).replace(/^\./, '').toLowerCase();
        const typeInfo = resolveFileType(ext);
        return {
            filename:        path.basename(absolutePath),
            extension:       ext,
            absolutePath:    absolutePath,
            sizeBytes:       stat.size,
            createdAtSource: stat.birthtime.toISOString(),
            updatedAtSource: stat.mtime.toISOString(),
            mimeType:        typeInfo.mime,
            mediaCategory:   typeInfo.category,
            extractable:     typeInfo.extractable,
        };
    } catch {
        return null;
    }
}
