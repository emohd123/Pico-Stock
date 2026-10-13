import { NextResponse } from 'next/server';
import { getElectricityOrderByReference } from '@/lib/electricityOrderStore';

export const dynamic = 'force-dynamic';

const NOT_FOUND = 'We could not find an order with that order number and email or mobile. Check both and try again, or contact Pico.';

function digits(value) {
    return String(value || '').replace(/\D/g, '');
}

/**
 * The order number alone is guessable, so it must be paired with the email or
 * mobile/tel used on the order (phones match on the last 8 digits).
 */
function contactMatches(order, given) {
    const value = String(given || '').trim();
    if (!value) return false;
    if (value.includes('@')) return value.toLowerCase() === order.vendor.email;
    const typed = digits(value);
    if (typed.length < 8) return false;
    return [order.vendor.mobile, order.vendor.tel]
        .map(digits)
        .some((phone) => phone.length >= 8 && phone.slice(-8) === typed.slice(-8));
}

/** Body: { reference, contact } → { orderUrl } */
export async function POST(request) {
    try {
        const body = await request.json().catch(() => ({}));
        const reference = String(body.reference || '').trim().toUpperCase().replace(/\s+/g, '');
        if (!reference || !body.contact) {
            return NextResponse.json({ error: 'Enter your order number and the email or mobile used on the order.' }, { status: 400 });
        }
        // A short pause makes trying many combinations slow.
        await new Promise((resolve) => setTimeout(resolve, 400));
        const order = await getElectricityOrderByReference(reference);
        if (!order || !contactMatches(order, body.contact)) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
        return NextResponse.json({ orderUrl: `/electricity/order/${order.orderKey}` });
    } catch (error) {
        console.error('Find electricity order failed:', error);
        return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
}
