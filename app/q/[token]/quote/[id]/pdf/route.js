import { NextResponse } from 'next/server';
import { getPrivate } from '@/lib/ministry/storage';
import { getMinistryByToken, getQuotationForMinistry } from '@/lib/ministry/queries';

export const runtime = 'nodejs';

export async function GET(req, { params }) {
    const { token, id } = params;
    const ministry = await getMinistryByToken(token);
    if (!ministry) return new NextResponse('Not found', { status: 404 });
    const quote = await getQuotationForMinistry(ministry.id, Number(id));
    if (!quote || !quote.pdfBlobUrl) return new NextResponse('Not found', { status: 404 });
    const file = await getPrivate(quote.pdfBlobUrl);
    if (!file) return new NextResponse('Not found', { status: 404 });
    // ?download=1 forces "save file" (soft copy); default is inline view/print.
    const download = new URL(req.url).searchParams.get('download');
    const disposition = download ? 'attachment' : 'inline';
    return new NextResponse(file.body, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `${disposition}; filename="${quote.ref.replace(/\//g, '-')}.pdf"`,
            'Cache-Control': 'private, max-age=0, must-revalidate',
        },
    });
}
