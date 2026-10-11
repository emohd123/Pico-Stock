import { NextResponse } from 'next/server';
import {
    EventMarketplaceStoreError,
    getEventMarketplace,
    getEventRequestByOrderKey,
    replaceEventRequestContents,
    updateEventRequest,
} from '@/lib/eventMarketplaceStore';
import { buildEventCatalogue, resolveOrderLines } from '@/lib/eventMarketplacePricing';
import { getProducts } from '@/lib/store';
import { sendEventRequestEmail } from '@/lib/email';
import { eventRequestPdfFilename, generateEventRequestPdf } from '@/lib/eventRequestPdf';
import {
    PICO_BANK_DETAILS,
    PaymentProofError,
    canSendReceipt,
    isOrderEditable,
    receiptEmailAddress,
    paymentSummary,
    sendProofReceivedEmail,
    storePaymentProof,
} from '@/lib/eventPayments';

export const dynamic = 'force-dynamic';

/** What the exhibitor sees about their own order (no internal notes). */
function forExhibitor(request, config) {
    return {
        event: { slug: config?.id, name: config?.name, days: config?.days, contactEmail: config?.contactEmail, contactPhone: config?.contactPhone },
        editable: isOrderEditable(request),
        // Bank details are sent once Pico approves the order.
        bank: (request.payment?.status || 'review') === 'review' ? null : PICO_BANK_DETAILS,
        canSendReceipt: canSendReceipt(request),
        receiptEmail: receiptEmailAddress(config),
        order: {
            reference: request.reference,
            company: request.company,
            contactName: request.contact?.name || '',
            // The owner's own details, so "Change order" can prefill the form.
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
                quantity: item.quantity,
                comment: item.comment || '',
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

/**
 * Change the order (body: { company, contact, items: [{ id, quantity, comment }] }).
 * Only before a receipt is uploaded; prices come from the live catalogue.
 */
export async function PUT(httpRequest, { params }) {
    try {
        const { request, config } = await load(params.key);
        if (!request) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
        if (!isOrderEditable(request)) {
            return NextResponse.json({ error: 'This order is already approved, so it can no longer be changed online. Please contact Pico, or place an additional order.' }, { status: 409 });
        }
        if (config?.status !== 'open') {
            return NextResponse.json({ error: 'This event is not accepting changes at the moment.' }, { status: 403 });
        }
        const body = await httpRequest.json().catch(() => ({}));
        const products = await getProducts();
        const items = resolveOrderLines(buildEventCatalogue(products, config), body.items);
        if (items.length === 0) {
            return NextResponse.json({ error: 'Keep at least one item in the order.' }, { status: 400 });
        }

        const stamp = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Bahrain', dateStyle: 'medium', timeStyle: 'short' });
        const before = `${request.items.length} line(s), ${Number(request.total).toFixed(3)} ${request.currency}`;
        const contact = body.contact && typeof body.contact === 'object' ? body.contact : request.contact;
        const updated = await replaceEventRequestContents(request, {
            company: String(body.company ?? request.company).trim(),
            contact,
            items,
        }, config, {
            // A rejected receipt no longer matches a changed order: start the payment again.
            payment: request.payment?.status === 'rejected' ? { status: 'awaiting', note: '' } : request.payment,
            adminNotes: [request.adminNotes, `Order changed by the exhibitor, ${stamp} (was ${before}).`].filter(Boolean).join('\n'),
        });

        const orderUrl = `${new URL(httpRequest.url).origin}/o/${params.key}`;
        let warning = null;
        try {
            const pdfAttachment = {
                filename: eventRequestPdfFilename(config, updated),
                content: await generateEventRequestPdf(config, updated, { kind: 'request', orderUrl }),
                contentType: 'application/pdf',
            };
            const sent = await sendEventRequestEmail({ event: config, request: updated, pdfAttachment, orderUrl, updated: true });
            if (!sent.success) warning = 'Order updated, but the email could not be sent.';
        } catch (error) {
            console.error('Order update email failed:', error);
            warning = 'Order updated, but the email could not be sent.';
        }
        return NextResponse.json({ success: true, warning, ...forExhibitor(updated, config) });
    } catch (error) {
        if (error instanceof EventMarketplaceStoreError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Order change failed:', error);
        return NextResponse.json({ error: 'The order could not be changed. Please try again.' }, { status: 500 });
    }
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
        if (!canSendReceipt(request)) {
            return NextResponse.json({ error: 'Your order is still being checked. We will email you the payment details once it is approved.' }, { status: 409 });
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
