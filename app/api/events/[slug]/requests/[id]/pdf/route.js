import { NextResponse } from 'next/server';
import { getEventMarketplace, getEventRequestById } from '@/lib/eventMarketplaceStore';
import { eventRequestPdfFilename, generateEventRequestPdf, orderConfirmationPdfFilename } from '@/lib/eventRequestPdf';

export const dynamic = 'force-dynamic';

/**
 * Admin: the order summary PDF for a stored request, or with ?type=confirmation
 * the official order confirmation once payment is verified. (Protected by middleware.)
 */
export async function GET(httpRequest, { params }) {
    try {
        const [config, found] = await Promise.all([
            getEventMarketplace(params.slug),
            getEventRequestById(params.slug, params.id),
        ]);
        if (!config || !found) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

        const url = new URL(httpRequest.url);
        const confirmation = url.searchParams.get('type') === 'confirmation';
        if (confirmation && found.payment?.status !== 'verified') {
            return NextResponse.json({ error: 'Payment for this order is not verified yet.' }, { status: 409 });
        }
        const orderUrl = found.orderKey ? `${url.origin}/o/${found.orderKey}` : '';
        const pdf = await generateEventRequestPdf(config, found, { kind: confirmation ? 'confirmation' : 'request', orderUrl });
        const filename = confirmation ? orderConfirmationPdfFilename(found) : eventRequestPdfFilename(config, found);
        return new NextResponse(pdf, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('Event request PDF failed:', error);
        return NextResponse.json({ error: 'Failed to generate the request PDF' }, { status: 500 });
    }
}
