import { NextResponse } from 'next/server';
import {
    ElectricityStoreError,
    bahrainStamp,
    getElectricityForm,
    getElectricityOrderByKey,
    publicForm,
    replaceElectricityOrder,
    resolveLines,
    updateElectricityOrder,
} from '@/lib/electricityOrderStore';
import {
    PICO_BANK_DETAILS,
    PaymentProofError,
    canSendReceipt,
    isOrderEditable,
    paymentSummary,
    storePaymentProof,
} from '@/lib/eventPayments';
import { sendElectricityProofReceived, sendNewOrderEmails } from '@/lib/electricityOrderEmails';

export const dynamic = 'force-dynamic';

// Public, secured by the order key in the link: the vendor's own order page.

function forVendor(order, form) {
    const { adminNotes, id, payment, eventId, contact, company, ...rest } = order;
    return {
        form: publicForm(form),
        order: rest,
        editable: isOrderEditable(order) && form.status === 'open',
        canSendReceipt: canSendReceipt(order),
        // Bank details are sent once Pico approves the order.
        bank: payment.status === 'review' ? null : PICO_BANK_DETAILS,
        payment: {
            ...paymentSummary(order),
            status: payment.status,
            proofName: payment.proofName,
            uploadedAt: payment.uploadedAt,
            verifiedAt: payment.verifiedAt,
            note: payment.status === 'rejected' ? payment.note : '',
        },
    };
}

async function load(key) {
    const order = await getElectricityOrderByKey(key);
    return order ? { order, form: await getElectricityForm() } : {};
}

export async function GET(_request, { params }) {
    const { order, form } = await load(params.key);
    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    return NextResponse.json(forVendor(order, form), { headers: { 'Cache-Control': 'no-store' } });
}

/** Change the order while Pico is still reviewing it. Body: { vendor, items }. */
export async function PUT(request, { params }) {
    try {
        const { order, form } = await load(params.key);
        if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
        if (!isOrderEditable(order) || form.status !== 'open') {
            return NextResponse.json({ error: 'This order is already approved, so it can no longer be changed online. Please contact Pico.' }, { status: 409 });
        }
        const body = await request.json().catch(() => ({}));
        const before = `${order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}; ${order.total.toFixed(3)} ${order.currency}`;
        const updated = await replaceElectricityOrder(order, { vendor: body.vendor, lines: resolveLines(form, body.items) },
            `Order changed by the vendor, ${bahrainStamp()} (was ${before}).`);

        const origin = new URL(request.url).origin;
        const sent = await sendNewOrderEmails({
            form, order: updated, updated: true,
            orderUrl: `${origin}/electricity/order/${updated.orderKey}`,
            adminUrl: `${origin}/admin/electricity`,
        }).catch((error) => ({ success: false, error }));
        return NextResponse.json({ ...forVendor(updated, form), warning: sent.success ? null : 'Order updated, but the email could not be sent.' });
    } catch (error) {
        if (error instanceof ElectricityStoreError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Electricity order change failed:', error);
        return NextResponse.json({ error: 'The order could not be changed. Please try again.' }, { status: 500 });
    }
}

/** Upload the bank-transfer receipt (multipart field "file"). */
export async function POST(request, { params }) {
    try {
        const { order, form } = await load(params.key);
        if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
        if (order.status === 'declined') return NextResponse.json({ error: 'This order was declined. Please contact Pico.' }, { status: 409 });
        if (order.payment.status === 'verified') return NextResponse.json({ error: 'Payment for this order is already verified.' }, { status: 409 });
        if (!canSendReceipt(order)) {
            return NextResponse.json({ error: 'Your order is still being checked. We will email you the payment details once it is approved.' }, { status: 409 });
        }
        const formData = await request.formData().catch(() => null);
        const stored = await storePaymentProof(order, formData?.get('file'));
        const updated = await updateElectricityOrder(order, {
            payment: { ...stored, status: 'submitted', uploadedAt: new Date().toISOString(), note: '' },
            appendNote: `Payment receipt uploaded by the vendor, ${bahrainStamp()} (${stored.proofName}).`,
        });
        await sendElectricityProofReceived({ form, order: updated, adminUrl: `${new URL(request.url).origin}/admin/electricity` })
            .catch((error) => console.error('[electricity] proof email failed:', error));
        return NextResponse.json(forVendor(updated, form));
    } catch (error) {
        if (error instanceof PaymentProofError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Electricity receipt upload failed:', error);
        return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
    }
}
