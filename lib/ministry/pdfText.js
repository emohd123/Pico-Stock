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
    // webpackIgnore keeps the bundler out of this import entirely, so Node
    // resolves it at runtime with *node* export conditions. Letting webpack
    // handle it picked the browser build inside the lambda ("DOMMatrix is not
    // defined"), and routing around it via createRequire only traded that for
    // a shimmed require.resolve ("t is not a function"). Both worked locally,
    // which is exactly why this had to be tested against the deployment.
    return import(/* webpackIgnore: true */ 'pdfjs-dist/legacy/build/pdf.mjs');
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
