/**
 * Test the AI quotation draft feature with real files.
 * Mirrors exactly what the browser sends to /api/quotations/ai/draft
 * Usage: node scripts/testAiDraft.mjs
 */

import { readFileSync } from 'fs';
import path from 'path';

const FILES = [
    'C:/Users/PICO/Desktop/Q 2026/Q 2026/Innovation Summit  2026/Diyar Al Muharraq/MOH Innovative Summit 2026 - RFP.pdf',
    'C:/Users/PICO/Desktop/Q 2026/Q 2026/Innovation Summit  2026/Diyar Al Muharraq/Diyar Al Muharraq @Innovation Summit 2026 -Pico design proposal -1.4.pdf',
];

// The images sent by the user (base64 of the screenshots shared in chat)
// We'll encode the PDFs as base64 data URLs — same as the browser FileReader does
function toDataUrl(filePath) {
    const buf = readFileSync(filePath);
    const b64 = buf.toString('base64');
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = ext === '.pdf' ? 'application/pdf'
        : ext === '.png' ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
        : 'application/octet-stream';
    return { name: path.basename(filePath), type: mimeType, data: `data:${mimeType};base64,${b64}` };
}

console.log('\nEncoding files...');
const files = FILES.map(f => {
    const payload = toDataUrl(f);
    console.log(`  ${payload.name} — ${(payload.data.length / 1024).toFixed(0)} KB base64`);
    return payload;
});

const body = {
    mode: 'draft',
    brief: 'Diyar Al Muharraq exhibition stand for MOH Innovation Summit 2026. 10x10m stand (B4). Premium branding, laser cut decorative panels, reception counter, LED screen, lounge area, wood cladding.',
    quotation: {
        client_org: 'Diyar Al Muharaq',
        currency_code: 'BHD',
        sections: [],
    },
    files,
};

console.log('\nCalling /api/quotations/ai/draft on Vercel production...');
const API_URL = 'https://pico-stock.vercel.app/api/quotations/ai/draft';

let res;
try {
    res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
} catch (err) {
    console.error('Network error:', err.message);
    process.exit(1);
}

const text = await res.text();
console.log('\nStatus:', res.status);

if (!res.ok) {
    console.error('Error response:', text.slice(0, 2000));
    process.exit(1);
}

let result;
try {
    result = JSON.parse(text);
} catch {
    console.error('Non-JSON response:', text.slice(0, 2000));
    process.exit(1);
}

console.log('\n══════════════════ AI DRAFT RESULT ══════════════════');
console.log('Provider  :', result.provider);
console.log('Confidence:', result.confidence);
console.log('Summary   :', result.summary);
console.log('\nAssumptions:');
(result.assumptions || []).forEach((a, i) => console.log(`  ${i+1}. ${a}`));
console.log('\nMissing details:');
(result.missing_details || []).forEach((m, i) => console.log(`  ${i+1}. ${m}`));
console.log('\nSections:');
const sections = result.draft_patch?.sections || [];
sections.forEach((section, si) => {
    console.log(`\n  [${String.fromCharCode(65+si)}] ${section.name} (rule: ${section.selling_rule})`);
    (section.items || []).forEach((item, ii) => {
        console.log(`    ${ii+1}. ${item.description} | ${item.qty} ${item.unit} | costs: ${item.costs_bhd || '—'}`);
    });
});
console.log('\nExclusions:', result.draft_patch?.exclusions || []);
console.log('Payment terms:', result.draft_patch?.payment_terms || []);
console.log('Matched quotations:', (result.matched_quotations || []).map(m => m.source_label));
console.log('══════════════════════════════════════════════════════\n');
