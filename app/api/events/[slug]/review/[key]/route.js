import { NextResponse } from 'next/server';
import { getEventRequestById, listEventRequests } from '@/lib/eventMarketplaceStore';
import { eventForReviewKey } from '@/lib/eventReviewKey';
import { getProducts } from '@/lib/store';
import { StockShortageError, availabilityForRequests, updateRequestStatusSafely } from '@/lib/eventStockCheck';

export const dynamic = 'force-dynamic';

const ACTIONS = { confirm: 'confirmed', decline: 'declined' };

async function catalogueImages(config) {
    const products = await getProducts().catch(() => []);
    const map = new Map(products.map((product) => [product.id, product.image]));
    for (const custom of config?.customItems || []) if (custom?.id) map.set(custom.id, custom.image || '');
    return map;
}

function forOrganizer(request, availability, imageById) {
    const availableById = new Map((availability || []).map((line) => [line.id, line.available]));
    return {
        id: request.id,
        reference: request.reference,
        company: request.company,
        contact: {
            name: request.contact?.name || '',
            email: request.contact?.email || '',
            phone: request.contact?.phone || '',
            stand: request.contact?.stand || '',
            notes: request.contact?.notes || '',
        },
        items: (request.items || []).map((item) => ({
            id: item.id,
            name: item.name,
            // Photo from our catalogue, not the URL the vendor's browser sent.
            image: imageById.get(item.id) || '',
            quantity: item.quantity,
            eventPrice: item.eventPrice,
            lineTotal: item.lineTotal,
            comment: item.comment,
            available: availableById.has(item.id) ? availableById.get(item.id) : null,
        })),
        subtotal: request.subtotal,
        vatPercent: request.vatPercent,
        vatAmount: request.vatAmount,
        total: request.total,
        currency: request.currency,
        status: request.status,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
    };
}

export async function GET(_request, { params }) {
    const config = await eventForReviewKey(params.slug, params.key);
    if (!config) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 });
    try {
        const requests = await listEventRequests(params.slug);
        const [availability, imageById] = await Promise.all([availabilityForRequests(requests), catalogueImages(config)]);
        return NextResponse.json({
            event: { name: config.name, days: config.days, currency: config.currency, vatPercent: config.vatPercent },
            requests: requests.map((request) => forOrganizer(request, availability.get(request.id), imageById)),
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Organizer review load failed:', error);
        return NextResponse.json({ error: 'Failed to load requests' }, { status: 500 });
    }
}

/** Body: { requestId, action: 'confirm' | 'decline' } */
export async function POST(request, { params }) {
    const config = await eventForReviewKey(params.slug, params.key);
    if (!config) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 });
    try {
        const body = await request.json().catch(() => ({}));
        const status = ACTIONS[body?.action];
        if (!status) return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
        const existing = await getEventRequestById(params.slug, body.requestId);
        if (!existing) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

        const stamp = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Bahrain', dateStyle: 'medium', timeStyle: 'short' });
        const note = `${status === 'confirmed' ? 'Confirmed' : 'Declined'} by the event organizer via the review link, ${stamp}.`;
        const adminNotes = [existing.adminNotes, note].filter(Boolean).join('\n');
        await updateRequestStatusSafely(params.slug, existing, { status, adminNotes });

        const requests = await listEventRequests(params.slug);
        const [availability, imageById] = await Promise.all([availabilityForRequests(requests), catalogueImages(config)]);
        const updated = requests.find((item) => item.id === existing.id);
        return NextResponse.json({ success: true, request: forOrganizer(updated, availability.get(updated.id), imageById) });
    } catch (error) {
        if (error instanceof StockShortageError) {
            return NextResponse.json({ error: error.message, shortages: error.shortages }, { status: 409 });
        }
        console.error('Organizer review update failed:', error);
        return NextResponse.json({ error: 'Failed to update the request' }, { status: 500 });
    }
}
