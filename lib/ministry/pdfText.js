import { linesFromItems } from './pdfLines';

// Text extraction for uploaded quotations.
//
// The import is resolved from disk on purpose. Importing 'pdfjs-dist' by
// specifier let the bundler pick the *browser* export condition inside the
// Vercel lambda, which needs DOMMatrix and threw "DOMMatrix is not defined" —
// while working perfectly on a developer machine. Resolving the legacy build's
// real path and importing that leaves no room for condition resolution to
// choose differently. The legacy build is the one written for Node and needs
// no canvas or native binary.
async function loadPdfjs() {
    const { createRequire } = await import('node:module');
    const { pathToFileURL } = await import('node:url');
    const path = await import('node:path');
    const require = createRequire(import.meta.url);

    let file;
    try {
        file = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
    } catch {
        // Package "exports" may refuse the deep path; go via the manifest.
        const pkg = require.resolve('pdfjs-dist/package.json');
        file = path.join(path.dirname(pkg), 'legacy', 'build', 'pdf.mjs');
    }
    return import(pathToFileURL(file).href);
}

export async function extractPdfText(bytes) {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({
        data: bytes,
        isEvalSupported: false,
        disableFontFace: true,
        useSystemFonts: false,
    }).promise;

    let out = '';
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        out += linesFromItems((await page.getTextContent()).items);
    }
    try { await doc.destroy(); } catch { /* nothing to clean up */ }
    return out;
}
