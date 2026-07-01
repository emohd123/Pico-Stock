import { NextResponse } from 'next/server';
import { getPrivate } from '@/lib/ministry/storage';
import { getMinistryByToken, getQuotationForMinistry } from '@/lib/ministry/queries';

export const runtime = 'nodejs';

export async function GET(_req, { params }) {
    const { token, id } = params;
    const ministry = await getMinistryByToken(token);
    if (!ministry) return new NextResponse('Not found', { status: 404 });
    const quote = await getQuotationForMinistry(ministry.id, Number(id));
    if (!quote || !quote.pdfBlobUrl) return new NextResponse('Not found', { status: 404 });
    const file = await getPrivate(quote.pdfBlobUrl);
    if (!file) return new NextResponse('Not found', { status: 404 });
    return new NextResponse(file.body, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${quote.ref.replace(/\//g, '-')}.pdf"`,
            'Cache-Control': 'private, max-age=0, must-revalidate',
        },
    });
}
