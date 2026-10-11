import { NextResponse } from 'next/server';
import { getEventMarketplace, getEventRequestById, makeLinkKey, updateEventRequest } from '@/lib/eventMarketplaceStore';
import { StockShortageError, checkRequestAvailability, shortageMessage, updateRequestStatusSafely } from '@/lib/eventStockCheck';
import { sendOrderConfirmedEmail, sendPaymentDetailsEmail, sendPaymentRejectedEmail, signedProofUrl } from '@/lib/eventPayments';
import { eventRequestPdfFilename, generateEventRequestPdf, orderConfirmationPdfFilename } from '@/lib/eventRequestPdf';

export const dynamic = 'force-dynamic';

// Admin-only: every /api/events/<slug>/requests/... route is protected by middleware.

/** Open the uploaded receipt (redirects to a 5-minute private link). */
export async function GET(_request, { params }) {
    const request = await getEventRequestById(params.slug, params.id);
    if (!request?.payment?.proofPath) return NextResponse.json({ error: 'No receipt uploaded.' }, { status: 404 });
    try {
        return NextResponse.redirect(await signedProofUrl(request.payment.proofPath));
    } catch (error) {
        console.error('Receipt link failed:', error);
        return NextResponse.json({ error: 'Could not open the receipt.' }, { status: 500 });
    }
}

function stamp() {
    return new Date().toLocaleString('en-GB', { timeZone: 'Asia/Bahrain', dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Body: { action: 'approve' | 'verify' | 'reject', note? }
 * approve: items available → payment details (bank transfer) emailed to the partner.
 * verify: payment received → order confirmed, stock locked → official confirmation emailed.
 * reject: exhibitor asked to upload again.
 */
export async function POST(httpRequest, { params }) {
    try {
        const body = await httpRequest.json().catch(() => ({}));
        const existing = await getEventRequestById(params.slug, params.id);
        if (!existing) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
        const config = await getEventMarketplace(params.slug);
        const origin = new URL(httpRequest.url).origin;

        // Requests from before payments existed get their order link on first use.
        let request = existing;
        if (!request.orderKey) request = await updateEventRequest(params.slug, request.id, { orderKey: makeLinkKey(10) });
        const orderUrl = `${origin}/o/${request.orderKey}`;

        if (body.action === 'approve') {
            if (request.status === 'declined') {
                return NextResponse.json({ error: 'This request is declined. Set it back before approving.' }, { status: 409 });
            }
            if ((request.payment?.status || 'review') !== 'review') {
                return NextResponse.json({ error: 'This order is already approved.' }, { status: 409 });
            }
            // Approving does not lock stock (paying does), but don't ask for money for items we can't supply.
            const { shortages } = await checkRequestAvailability(request);
            if (shortages.length) return NextResponse.json({ error: shortageMessage(shortages) }, { status: 409 });

            const updated = await updateEventRequest(params.slug, request.id, {
                payment: { status: 'awaiting', approvedAt: new Date().toISOString() },
                adminNotes: [request.adminNotes, `Approved by Pico and payment details sent, ${stamp()}.`].filter(Boolean).join('\n'),
            });
            let warning = null;
            try {
                const pdf = await generateEventRequestPdf(config, updated, { kind: 'request', orderUrl });
                const sent = await sendPaymentDetailsEmail({
                    event: config,
                    request: updated,
                    orderUrl,
                    pdfAttachment: { filename: eventRequestPdfFilename(config, updated), content: pdf, contentType: 'application/pdf' },
                });
                if (!sent.success) {
                    warning = updated.contact?.email
                        ? 'Approved, but the payment details email could not be sent. Please send them manually.'
                        : 'Approved. This partner gave no email address, so please send the payment details by phone or WhatsApp.';
                }
            } catch (error) {
                console.error('Payment details email failed:', error);
                warning = 'Approved, but the payment details email could not be sent. Please send them manually.';
            }
            return NextResponse.json({ success: true, request: updated, warning });
        }

        if (body.action === 'verify') {
            if (request.status === 'declined') {
                return NextResponse.json({ error: 'This request is declined. Set it back before verifying payment.' }, { status: 409 });
            }
            const verifiedAt = new Date().toISOString();
            const updated = await updateRequestStatusSafely(params.slug, request, {
                status: 'confirmed',
                payment: { status: 'verified', verifiedAt, note: '' },
                adminNotes: [request.adminNotes, `Payment verified and order confirmed by Pico, ${stamp()}.`].filter(Boolean).join('\n'),
            });

            let warning = null;
            try {
                const pdf = await generateEventRequestPdf(config, updated, { kind: 'confirmation', orderUrl });
                const sent = await sendOrderConfirmedEmail({
                    event: config,
                    request: updated,
                    orderUrl,
                    pdfAttachment: { filename: orderConfirmationPdfFilename(updated), content: pdf, contentType: 'application/pdf' },
                });
                if (!sent.success) warning = 'Payment verified, but the confirmation email could not be sent.';
            } catch (error) {
                console.error('Order confirmation email failed:', error);
                warning = 'Payment verified, but the confirmation email could not be sent.';
            }
            return NextResponse.json({ success: true, request: updated, warning });
        }

        if (body.action === 'reject') {
            const note = String(body.note || '').trim().slice(0, 300);
            const updated = await updateEventRequest(params.slug, request.id, {
                payment: { status: 'rejected', note },
                adminNotes: [request.adminNotes, `Payment receipt not accepted by Pico, ${stamp()}${note ? `: ${note}` : ''}.`].filter(Boolean).join('\n'),
            });
            const sent = await sendPaymentRejectedEmail({ event: config, request: updated, orderUrl, note });
            return NextResponse.json({
                success: true,
                request: updated,
                warning: sent.success ? null : 'Marked as not verified, but the email to the exhibitor could not be sent.',
            });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (error) {
        if (error instanceof StockShortageError) return NextResponse.json({ error: error.message }, { status: 409 });
        console.error('Payment update failed:', error);
        return NextResponse.json({ error: 'Failed to update the payment' }, { status: 500 });
    }
}
