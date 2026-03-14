/**
 * worker/logger.js — Structured logging with counters and summary.
 */

const startTime = Date.now();
const counts = { indexed: 0, skipped: 0, failed: 0, total: 0 };

function ts() {
    return new Date().toISOString().slice(11, 19);
}

const logger = {
    info(msg, data) {
        console.log(`[${ts()}] ℹ️  ${msg}${data ? ' ' + JSON.stringify(data) : ''}`);
    },

    success(msg, data) {
        console.log(`[${ts()}] ✅ ${msg}${data ? ' ' + JSON.stringify(data) : ''}`);
    },

    warn(msg, data) {
        console.warn(`[${ts()}] ⚠️  ${msg}${data ? ' ' + JSON.stringify(data) : ''}`);
    },

    error(msg, data) {
        console.error(`[${ts()}] ❌ ${msg}${data ? ' ' + JSON.stringify(data) : ''}`);
    },

    progress(current, total, msg) {
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        process.stdout.write(`\r[${ts()}] 📊 ${msg}: ${current}/${total} (${pct}%)   `);
    },

    newline() {
        console.log();
    },

    // Counters
    countIndexed() { counts.indexed++; counts.total++; },
    countSkipped() { counts.skipped++; counts.total++; },
    countFailed() { counts.failed++; counts.total++; },

    getCounts() { return { ...counts }; },

    resetCounts() {
        counts.indexed = 0;
        counts.skipped = 0;
        counts.failed = 0;
        counts.total = 0;
    },

    summary() {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log();
        console.log('═══════════════════════════════════════════');
        console.log('  📊 SCAN SUMMARY');
        console.log('═══════════════════════════════════════════');
        console.log(`  Total files found:   ${counts.total}`);
        console.log(`  ✅ Indexed:          ${counts.indexed}`);
        console.log(`  ⏭️  Skipped:          ${counts.skipped}`);
        console.log(`  ❌ Failed:           ${counts.failed}`);
        console.log(`  ⏱️  Duration:         ${elapsed}s`);
        console.log('═══════════════════════════════════════════');
        console.log();
    },
};

module.exports = logger;
