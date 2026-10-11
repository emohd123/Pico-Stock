import { NextResponse } from 'next/server';
import { getEventMarketplace, getEventRequestByOrderKey } from '@/lib/eventMarketplaceStore';
import {
    eventRequestPdfFilename,
    generateEventRequestPdf,
    orderConfirmationPdfFilename,
} from '@/lib/eventRequestPdf';

export const dynamic = 'force-dynamic';

/** ?type=summary (default): order summary with bank details. ?type=confirmation: once paid. */
export async function GET(httpRequest, { params }) {
    const request = await getEventRequestByOrderKey(params.key);
    if (!request) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    const config = await getEventMarketplace(request.eventId);
    const url = new URL(httpRequest.url);
    const wantsConfirmation = url.searchParams.get('type') === 'confirmation';
    if (wantsConfirmation && request.payment?.status !== 'verified') {
        return NextResponse.json({ error: 'The order confirmation is issued once payment is verified.' }, { status: 409 });
    }
    try {
        const pdf = await generateEventRequestPdf(config, request, {
            kind: wantsConfirmation ? 'confirmation' : 'request',
            orderUrl: `${url.origin}/o/${params.key}`,
        });
        const filename = wantsConfirmation ? orderConfirmationPdfFilename(request) : eventRequestPdfFilename(config, request);
        return new NextResponse(pdf, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('Order PDF failed:', error);
        return NextResponse.json({ error: 'Could not create the PDF.' }, { status: 500 });
    }
}
