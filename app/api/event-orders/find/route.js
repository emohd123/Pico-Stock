import { NextResponse } from 'next/server';
import { getEventRequestByReference, makeLinkKey, updateEventRequest } from '@/lib/eventMarketplaceStore';

export const dynamic = 'force-dynamic';

const NOT_FOUND = 'We could not find an order with that order number and email or phone. Check both and try again, or contact Pico.';

function digits(value) {
    return String(value || '').replace(/\D/g, '');
}

/**
 * The order number alone is guessable (date + 4 characters), so it must be
 * paired with the email or phone used on the order. Phones match on the last
 * 8 digits, so "+973 3635 7377" and "36357377" are the same number.
 */
function contactMatches(request, given) {
    const value = String(given || '').trim();
    if (!value) return false;
    const email = String(request.contact?.email || '').trim().toLowerCase();
    if (value.includes('@')) return Boolean(email) && value.toLowerCase() === email;
    const phone = digits(request.contact?.phone);
    const typed = digits(value);
    return phone.length >= 8 && typed.length >= 8 && phone.slice(-8) === typed.slice(-8);
}

/** Body: { reference, contact } → { orderUrl } */
export async function POST(httpRequest) {
    try {
        const body = await httpRequest.json().catch(() => ({}));
        const reference = String(body.reference || '').trim().toUpperCase().replace(/\s+/g, '');
        if (!reference || !body.contact) {
            return NextResponse.json({ error: 'Enter your order number and the email or phone used on the order.' }, { status: 400 });
        }
        // A short pause makes trying many combinations slow.
        await new Promise((resolve) => setTimeout(resolve, 400));
        let request = await getEventRequestByReference(reference);
        if (!request || !contactMatches(request, body.contact)) {
            return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
        }
        if (!request.orderKey) request = await updateEventRequest(request.eventId, request.id, { orderKey: makeLinkKey(10) });
        return NextResponse.json({ orderUrl: `/o/${request.orderKey}` });
    } catch (error) {
        console.error('Find order failed:', error);
        return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
}
