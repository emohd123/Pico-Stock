/**
 * worker/drive.js — Verify access to the pCloud sync drive.
 * Returns detailed diagnostics for common failure modes.
 */

const fs = require('fs');
const path = require('path');

/**
 * Check if the source root drive is accessible.
 * @param {string} rootPath — e.g. "P:\\"
 * @returns {{ accessible: boolean, message: string, details: object }}
 */
function checkDriveAccess(rootPath) {
    const result = {
        accessible: false,
        message: '',
        details: {
            path: rootPath,
            exists: false,
            readable: false,
            isDirectory: false,
            fileCount: null,
        },
    };

    // 1. Check if path exists
    try {
        fs.accessSync(rootPath, fs.constants.F_OK);
        result.details.exists = true;
    } catch (err) {
        if (err.code === 'ENOENT') {
            result.message = `Drive not found: "${rootPath}" does not exist. Is pCloud synced and the drive mapped?`;
        } else if (err.code === 'EPERM' || err.code === 'EACCES') {
            result.message = `Permission denied: Cannot access "${rootPath}". Run as administrator or check drive permissions.`;
        } else {
            result.message = `Drive unavailable: "${rootPath}" — ${err.message}. The mapped drive may not be available in this session.`;
        }
        return result;
    }

    // 2. Check read permission
    try {
        fs.accessSync(rootPath, fs.constants.R_OK);
        result.details.readable = true;
    } catch {
        result.message = `Permission denied: Can see "${rootPath}" but cannot read it. Check drive permissions.`;
        return result;
    }

    // 3. Check if it's a directory
    try {
        const stat = fs.statSync(rootPath);
        result.details.isDirectory = stat.isDirectory();
        if (!stat.isDirectory()) {
            result.message = `"${rootPath}" exists but is not a directory.`;
            return result;
        }
    } catch (err) {
        result.message = `Cannot stat "${rootPath}": ${err.message}`;
        return result;
    }

    // 4. Try to list contents (quick sanity check)
    try {
        const entries = fs.readdirSync(rootPath);
        result.details.fileCount = entries.length;
        result.accessible = true;
        result.message = `Drive accessible: "${rootPath}" — ${entries.length} top-level entries found.`;
    } catch (err) {
        result.message = `Drive exists but listing failed: ${err.message}. The drive may be disconnected or corrupted.`;
    }

    return result;
}

module.exports = { checkDriveAccess };
