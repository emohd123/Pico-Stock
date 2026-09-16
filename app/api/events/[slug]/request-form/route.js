import { NextResponse } from 'next/server';
import { getEventMarketplace } from '@/lib/eventMarketplaceStore';
import { buildEventCatalogue } from '@/lib/eventMarketplacePricing';
import { eventRequestPdfFilename, generateEventRequestPdf } from '@/lib/eventRequestPdf';
import { getProducts } from '@/lib/store';

export const dynamic = 'force-dynamic';

const MAX_LINES = 60;

/**
 * Public: generate a request form PDF (quotation layout, with pictures) for
 * the items a client has selected. Nothing is stored; prices are resolved
 * against the live event catalogue exactly as a submitted request would be.
 */
export async function POST(request, { params }) {
    try {
        const config = await getEventMarketplace(params.slug);
        if (!config) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        if (config.status !== 'open') {
            return NextResponse.json({ error: 'This event is not accepting requests at the moment.' }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        const requestedLines = Array.isArray(body.items) ? body.items.slice(0, MAX_LINES) : [];
        if (requestedLines.length === 0) {
            return NextResponse.json({ error: 'Select at least one item first.' }, { status: 400 });
        }

        const products = await getProducts();
        const byId = new Map(buildEventCatalogue(products, config).map((item) => [item.id, item]));
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
                quantity: Math.max(1, Math.min(9999, Number.parseInt(line.quantity, 10) || 1)),
                comment: String(line.comment || '').trim().slice(0, 500),
            });
        }
        if (items.length === 0) {
            return NextResponse.json({ error: 'The selected items are no longer available for this event.' }, { status: 400 });
        }

        const contact = body.contact && typeof body.contact === 'object' ? body.contact : {};
        const draft = {
            reference: String(body.reference || '').trim().slice(0, 40) || 'DRAFT',
            company: String(body.company || '').trim().slice(0, 200) || '—',
            contact: {
                name: String(contact.name || '').trim().slice(0, 200),
                email: String(contact.email || '').trim().slice(0, 200),
                phone: String(contact.phone || '').trim().slice(0, 60),
                stand: String(contact.stand || '').trim().slice(0, 100),
                notes: String(contact.notes || '').trim().slice(0, 3000),
            },
            items,
            currency: config.currency,
            createdAt: new Date().toISOString(),
        };

        const pdf = await generateEventRequestPdf(config, draft);
        return new NextResponse(pdf, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${eventRequestPdfFilename(config, draft)}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('Event request form PDF failed:', error);
        return NextResponse.json({ error: 'Failed to generate the request form' }, { status: 500 });
    }
}
