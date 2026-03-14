/**
 * worker/config.js — Load and validate environment variables.
 * Uses dotenv to read .env.local from the project root.
 */

const path = require('path');

// Load .env.local from project root
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const config = {
    sourceRoot: process.env.PCLOUD_SOURCE_ROOT || 'P:\\',

    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,

    // Worker settings
    batchSize: parseInt(process.env.PCLOUD_BATCH_SIZE || '100', 10),
    maxFiles: parseInt(process.env.PCLOUD_MAX_FILES || '500000', 10),
    confidenceThreshold: parseFloat(process.env.PCLOUD_CONFIDENCE_THRESHOLD || '0.6'),
    openaiApiKey: process.env.OPENAI_API_KEY,
};

/**
 * Validate that all required config is present.
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validate() {
    const errors = [];

    if (!config.supabaseUrl) {
        errors.push('Missing NEXT_PUBLIC_SUPABASE_URL in .env.local');
    }
    if (!config.supabaseKey) {
        errors.push('Missing SUPABASE_SERVICE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) in .env.local');
    }
    if (!config.sourceRoot) {
        errors.push('Missing PCLOUD_SOURCE_ROOT in .env.local (default: P:\\)');
    }

    return { valid: errors.length === 0, errors };
}

module.exports = { config, validate };
