import { NextResponse } from 'next/server';
import { getPrivate } from '@/lib/ministry/storage';
import { contentDisposition } from '@/lib/ministry/download';
import { getQuotationByShareToken, getMinistryNote } from '@/lib/ministry/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A project-note attachment, for whoever holds the share link. Two conditions,
// both required: the note belongs to the ministry that token unlocks, and PICO
// ticked "Show to production" on it. Without the second check, an internal file
// would leak the moment its note id was guessed.
export async function GET(req, { params }) {
    const quote = await getQuotationByShareToken(params.token);
    if (!quote) return new NextResponse('Not found', { status: 404 });

    const note = await getMinistryNote(Number(params.id));
    if (!note || note.ministryId !== quote.ministryId || !note.showToProduction || !note.fileUrl) {
        return new NextResponse('Not found', { status: 404 });
    }

    // A blob that has gone missing is a 404 to the reader, not a server error.
    let stored = null;
    try { stored = await getPrivate(note.fileUrl); } catch { stored = null; }
    if (!stored) return new NextResponse('Not found', { status: 404 });

    return new NextResponse(stored.body, {
        headers: {
            'Content-Type': note.fileType || stored.contentType || 'application/octet-stream',
            'Content-Disposition': contentDisposition(note.fileName || 'attachment'),
            'Cache-Control': 'no-store',
        },
    });
}
