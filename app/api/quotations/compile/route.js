import { NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { isAdmin } from '@/lib/ministry/auth';
import { getMinistryById, getMinistryQuotations } from '@/lib/ministry/queries';
import { getPrivate } from '@/lib/ministry/storage';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Merges the latest quotation PDF of each selected ministry into one document,
// in the order the ids are given. Admin only.
export async function POST(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    let body;
    try { body = await req.json(); } catch { return new NextResponse('Invalid request', { status: 400 }); }
    const ids = Array.isArray(body?.ministryIds) ? body.ministryIds.map(Number).filter(Boolean) : [];
    if (ids.length === 0) return new NextResponse('Select at least one ministry', { status: 400 });

    const merged = await PDFDocument.create();
    let added = 0;
    for (const id of ids) {
        const ministry = await getMinistryById(id);
        if (!ministry) continue;
        const quotes = await getMinistryQuotations(id);
        const latest = quotes.find((q) => q.pdfBlobUrl);
        if (!latest) continue;
        const file = await getPrivate(latest.pdfBlobUrl);
        if (!file) continue;
        try {
            const src = await PDFDocument.load(Buffer.from(file.body));
            const pages = await merged.copyPages(src, src.getPageIndices());
            pages.forEach((p) => merged.addPage(p));
            added += 1;
        } catch { /* skip a PDF that fails to parse */ }
    }
    if (added === 0) return new NextResponse('No quotations found for the selected ministries', { status: 404 });

    const bytes = await merged.save();
    return new NextResponse(Buffer.from(bytes), {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="Compiled-quotations-${added}.pdf"`,
            'Cache-Control': 'no-store',
        },
    });
}
