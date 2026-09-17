import { NextResponse } from 'next/server';
import {
    EventMarketplaceStoreError,
    createEventRequest,
    getEventMarketplace,
    listEventRequests,
} from '@/lib/eventMarketplaceStore';
import { buildEventCatalogue } from '@/lib/eventMarketplacePricing';
import { getProducts } from '@/lib/store';
import { sendEventRequestEmail } from '@/lib/email';
import { eventRequestPdfFilename, generateEventRequestPdf } from '@/lib/eventRequestPdf';

export const dynamic = 'force-dynamic';

const MAX_LINES = 60;

function errorResponse(error, fallback) {
    if (error instanceof EventMarketplaceStoreError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(fallback, error);
    return NextResponse.json({ error: fallback }, { status: 500 });
}

/** Admin: list requests for this event. (Protected by middleware.) */
export async function GET(_request, { params }) {
    try {
        const requests = await listEventRequests(params.slug);
        return NextResponse.json(requests, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return errorResponse(error, 'Failed to load requests');
    }
}

/**
 * Public: a client submits a request from the event page.
 * Prices are never trusted from the client; every line is resolved against
 * the live event catalogue so the stored total matches what the admin set.
 */
export async function POST(request, { params }) {
    try {
        const config = await getEventMarketplace(params.slug);
        if (!config) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }
        if (config.status !== 'open') {
            return NextResponse.json({ error: 'This event is not accepting requests at the moment.' }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        const requestedLines = Array.isArray(body.items) ? body.items.slice(0, MAX_LINES) : [];
        if (requestedLines.length === 0) {
            return NextResponse.json({ error: 'Select at least one item before sending a request.' }, { status: 400 });
        }

        const products = await getProducts();
        const catalogue = buildEventCatalogue(products, config);
        const byId = new Map(catalogue.map((item) => [item.id, item]));

        const items = [];
        for (const line of requestedLines) {
            const match = line && line.id ? byId.get(String(line.id)) : null;
            if (!match) continue;
            items.push({
                id: match.id,
                source: match.source,
                name: match.name,
                category: match.category,
                image: match.image,
                eventPrice: match.eventPrice,
                quantity: line.quantity,
                comment: line.comment,
            });
        }
        if (items.length === 0) {
            return NextResponse.json({ error: 'The selected items are no longer available for this event.' }, { status: 400 });
        }

        const company = String(body.company || '').trim();
        const contact = body.contact && typeof body.contact === 'object' ? body.contact : {};

        const created = await createEventRequest(params.slug, { company, contact, items }, config);

        let emailWarning = null;
        try {
            let pdfAttachment = null;
            try {
                pdfAttachment = {
                    filename: eventRequestPdfFilename(config, created),
                    content: await generateEventRequestPdf(config, created),
                    contentType: 'application/pdf',
                };
            } catch (pdfError) {
                console.error('Event request PDF for email failed:', pdfError);
            }
            const result = await sendEventRequestEmail({ event: config, request: created, pdfAttachment });
            if (!result.success) emailWarning = 'Request saved, but the notification email could not be sent.';
        } catch (emailError) {
            console.error('Event request email failed:', emailError);
            emailWarning = 'Request saved, but the notification email could not be sent.';
        }

        return NextResponse.json({ success: true, request: created, warning: emailWarning });
    } catch (error) {
        return errorResponse(error, 'Failed to submit the request');
    }
}
