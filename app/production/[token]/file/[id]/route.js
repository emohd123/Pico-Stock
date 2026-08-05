import { NextResponse } from 'next/server';
import { getPrivate } from '@/lib/ministry/storage';
import { getQuotationByShareToken, getProductionFile } from '@/lib/ministry/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Streams a private blob to whoever holds the share link. The file must belong
// to the meeting that token unlocks — otherwise any valid token would expose
// every other meeting's files by guessing ids.
export async function GET(req, { params }) {
    const quote = await getQuotationByShareToken(params.token);
    if (!quote) return new NextResponse('Not found', { status: 404 });

    const file = await getProductionFile(Number(params.id));
    if (!file || file.quotationId !== quote.id) return new NextResponse('Not found', { status: 404 });

    const stored = await getPrivate(file.blobUrl);
    if (!stored) return new NextResponse('Not found', { status: 404 });

    const safeName = file.name.replace(/["\\]/g, '');
    return new NextResponse(stored.body, {
        headers: {
            'Content-Type': file.contentType || stored.contentType || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${safeName}"`,
            'Cache-Control': 'no-store',
        },
    });
}
