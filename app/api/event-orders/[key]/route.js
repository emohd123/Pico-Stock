import { NextResponse } from 'next/server';
import { getEventMarketplace, getEventRequestByOrderKey, updateEventRequest } from '@/lib/eventMarketplaceStore';
import {
    PICO_BANK_DETAILS,
    PaymentProofError,
    paymentSummary,
    sendProofReceivedEmail,
    storePaymentProof,
} from '@/lib/eventPayments';

export const dynamic = 'force-dynamic';

/** What the exhibitor sees about their own order (no internal notes). */
function forExhibitor(request, config) {
    return {
        event: { name: config?.name, days: config?.days, contactEmail: config?.contactEmail, contactPhone: config?.contactPhone },
        bank: PICO_BANK_DETAILS,
        order: {
            reference: request.reference,
            company: request.company,
            contactName: request.contact?.name || '',
            items: (request.items || []).map((item) => ({
                id: item.id,
                name: item.name,
                quantity: item.quantity,
                eventPrice: item.eventPrice,
                lineTotal: item.lineTotal,
            })),
            subtotal: request.subtotal,
            vatPercent: request.vatPercent,
            vatAmount: request.vatAmount,
            total: request.total,
            currency: request.currency,
            createdAt: request.createdAt,
        },
        payment: {
            ...paymentSummary(request),
            status: request.payment?.status || 'awaiting',
            proofName: request.payment?.proofName || '',
            uploadedAt: request.payment?.uploadedAt || '',
            verifiedAt: request.payment?.verifiedAt || '',
            note: request.payment?.status === 'rejected' ? request.payment?.note || '' : '',
        },
    };
}

async function load(key) {
    const request = await getEventRequestByOrderKey(key);
    if (!request) return {};
    const config = await getEventMarketplace(request.eventId);
    return { request, config };
}

export async function GET(_request, { params }) {
    const { request, config } = await load(params.key);
    if (!request) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    return NextResponse.json(forExhibitor(request, config), { headers: { 'Cache-Control': 'no-store' } });
}

/** Upload the bank-transfer receipt (multipart field "file"). */
export async function POST(httpRequest, { params }) {
    try {
        const { request, config } = await load(params.key);
        if (!request) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
        if (request.status === 'declined') {
            return NextResponse.json({ error: 'This order was declined. Please contact Pico.' }, { status: 409 });
        }
        if (request.payment?.status === 'verified') {
            return NextResponse.json({ error: 'Payment for this order is already verified.' }, { status: 409 });
        }

        const form = await httpRequest.formData().catch(() => null);
        const file = form?.get('file');
        const stored = await storePaymentProof(request, file);
        const uploadedAt = new Date().toISOString();
        const stamp = new Date(uploadedAt).toLocaleString('en-GB', { timeZone: 'Asia/Bahrain', dateStyle: 'medium', timeStyle: 'short' });
        const updated = await updateEventRequest(request.eventId, request.id, {
            payment: { ...stored, status: 'submitted', uploadedAt, note: '' },
            adminNotes: [request.adminNotes, `Payment receipt uploaded by the exhibitor, ${stamp} (${stored.proofName}).`].filter(Boolean).join('\n'),
        });

        const origin = new URL(httpRequest.url).origin;
        await sendProofReceivedEmail({ event: config, request: updated, adminUrl: `${origin}/admin/${request.eventId}` })
            .catch((error) => console.error('[payments] proof email failed:', error));

        return NextResponse.json({ success: true, ...forExhibitor(updated, config) });
    } catch (error) {
        if (error instanceof PaymentProofError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Payment proof upload failed:', error);
        return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
    }
}
