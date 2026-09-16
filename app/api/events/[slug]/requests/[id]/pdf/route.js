import { NextResponse } from 'next/server';
import { getEventMarketplace, getEventRequestById } from '@/lib/eventMarketplaceStore';
import { eventRequestPdfFilename, generateEventRequestPdf } from '@/lib/eventRequestPdf';

export const dynamic = 'force-dynamic';

/** Admin: download the request form PDF for a stored request. (Protected by middleware.) */
export async function GET(_request, { params }) {
    try {
        const [config, found] = await Promise.all([
            getEventMarketplace(params.slug),
            getEventRequestById(params.slug, params.id),
        ]);
        if (!config || !found) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

        const pdf = await generateEventRequestPdf(config, found);
        return new NextResponse(pdf, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${eventRequestPdfFilename(config, found)}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('Event request PDF failed:', error);
        return NextResponse.json({ error: 'Failed to generate the request PDF' }, { status: 500 });
    }
}
