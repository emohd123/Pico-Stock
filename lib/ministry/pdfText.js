// Text extraction for uploaded quotations.
//
// pdf-parse is not used here: inside the Vercel lambda it resolves to a build
// that expects browser globals and dies with "DOMMatrix is not defined" — it
// works locally, so the failure only shows in production. pdfjs-dist's *legacy*
// build is the one built for Node, and text extraction needs no canvas.
export async function extractPdfText(bytes) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({
        data: bytes,
        isEvalSupported: false,
        disableFontFace: true,
        useSystemFonts: false,
    }).promise;

    let out = '';
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        // pdfjs emits positioned fragments, not lines. Group them by their
        // baseline (transform[5]) and order left-to-right to rebuild the rows
        // the quotation scanner reads.
        const rows = new Map();
        for (const item of content.items) {
            if (typeof item.str !== 'string' || !item.str) continue;
            const y = Math.round(item.transform[5]);
            if (!rows.has(y)) rows.set(y, []);
            rows.get(y).push({ x: item.transform[4], w: item.width || 0, s: item.str });
        }
        for (const y of [...rows.keys()].sort((a, b) => b - a)) {
            const frags = rows.get(y).sort((a, b) => a.x - b.x);
            let line = '';
            let prevEnd = null;
            for (const f of frags) {
                // Table columns share a baseline, so neighbouring cells would be
                // glued together ("Conference Communication24-inch display...").
                // A visible gap means a space belongs there.
                if (prevEnd !== null && f.x - prevEnd > 1 && !/\s$/.test(line) && !/^\s/.test(f.s)) line += ' ';
                line += f.s;
                prevEnd = f.x + f.w;
            }
            out += line + '\n';
        }
    }
    try { await doc.destroy(); } catch { /* nothing to clean up */ }
    return out;
}
