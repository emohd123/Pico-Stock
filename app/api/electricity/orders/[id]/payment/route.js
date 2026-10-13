import { NextResponse } from 'next/server';
import { bahrainStamp, getElectricityForm, getElectricityOrderById, updateElectricityOrder } from '@/lib/electricityOrderStore';
import { signedProofUrl } from '@/lib/eventPayments';
import {
    sendElectricityConfirmed,
    sendElectricityDeclined,
    sendElectricityPaymentDetails,
    sendElectricityRejected,
} from '@/lib/electricityOrderEmails';

export const dynamic = 'force-dynamic';

// Admin-only (middleware).

/** Open the uploaded receipt (redirects to a 5-minute private link). */
export async function GET(_request, { params }) {
    const order = await getElectricityOrderById(params.id);
    if (!order?.payment?.proofPath) return NextResponse.json({ error: 'No receipt uploaded.' }, { status: 404 });
    try {
        return NextResponse.redirect(await signedProofUrl(order.payment.proofPath));
    } catch (error) {
        console.error('Receipt link failed:', error);
        return NextResponse.json({ error: 'Could not open the receipt.' }, { status: 500 });
    }
}

/**
 * Body: { action, note? }
 * approve: bank details emailed to the vendor (payment: review → awaiting).
 * verify:  payment received → order confirmed → confirmation emailed.
 * reject:  receipt not accepted → vendor asked to send it again.
 * decline: order not accepted → vendor told. reopen: undo a decline.
 */
export async function POST(request, { params }) {
    try {
        const order = await getElectricityOrderById(params.id);
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        const form = await getElectricityForm();
        const body = await request.json().catch(() => ({}));
        const note = String(body.note || '').trim().slice(0, 300);
        const orderUrl = `${new URL(request.url).origin}/electricity/order/${order.orderKey}`;
        const stamp = bahrainStamp();
        const declined = order.status === 'declined';

        if (body.action === 'approve') {
            if (declined) return NextResponse.json({ error: 'This order is declined. Reopen it first.' }, { status: 409 });
            if (order.payment.status !== 'review') return NextResponse.json({ error: 'This order is already approved.' }, { status: 409 });
            let updated = await updateElectricityOrder(order, {
                payment: { status: 'awaiting', approvedAt: new Date().toISOString() },
                appendNote: `Approved, payment details sent to ${order.vendor.email}, ${stamp}.`,
            });
            const sent = await sendElectricityPaymentDetails({ form, order: updated, orderUrl });
            if (!sent.success) {
                updated = await updateElectricityOrder(updated, { appendNote: 'The payment details email FAILED: send the bank details manually.' });
            }
            return NextResponse.json({ order: updated, warning: sent.success ? null : `Approved, but the payment details email failed (${sent.error}). Please send them manually.` });
        }

        if (body.action === 'verify') {
            if (declined) return NextResponse.json({ error: 'This order is declined. Reopen it first.' }, { status: 409 });
            if (order.payment.status === 'verified') return NextResponse.json({ error: 'Payment is already verified.' }, { status: 409 });
            const updated = await updateElectricityOrder(order, {
                status: 'confirmed',
                payment: { status: 'verified', verifiedAt: new Date().toISOString(), note: '' },
                appendNote: `Payment verified and order confirmed, ${stamp}.`,
            });
            const sent = await sendElectricityConfirmed({ form, order: updated, orderUrl });
            return NextResponse.json({ order: updated, warning: sent.success ? null : 'Payment verified, but the confirmation email could not be sent.' });
        }

        if (body.action === 'reject') {
            if (!['awaiting', 'submitted'].includes(order.payment.status)) {
                return NextResponse.json({ error: 'There is no payment waiting to be checked.' }, { status: 409 });
            }
            const updated = await updateElectricityOrder(order, {
                payment: { status: 'rejected', note },
                appendNote: `Payment receipt not accepted, ${stamp}${note ? `: ${note}` : ''}.`,
            });
            const sent = await sendElectricityRejected({ form, order: updated, orderUrl, note });
            return NextResponse.json({ order: updated, warning: sent.success ? null : 'Marked as not verified, but the email to the vendor could not be sent.' });
        }

        if (body.action === 'decline') {
            if (order.payment.status === 'verified') return NextResponse.json({ error: 'This order is already paid and confirmed.' }, { status: 409 });
            const updated = await updateElectricityOrder(order, { status: 'declined', appendNote: `Declined, ${stamp}${note ? `: ${note}` : ''}.` });
            const sent = await sendElectricityDeclined({ form, order: updated, note });
            return NextResponse.json({ order: updated, warning: sent.success ? null : 'Declined, but the email to the vendor could not be sent.' });
        }

        if (body.action === 'reopen') {
            if (!declined) return NextResponse.json({ error: 'This order is not declined.' }, { status: 409 });
            const updated = await updateElectricityOrder(order, { status: 'new', appendNote: `Reopened, ${stamp}.` });
            return NextResponse.json({ order: updated });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (error) {
        console.error('Electricity payment update failed:', error);
        return NextResponse.json({ error: 'Failed to update the order' }, { status: 500 });
    }
}
