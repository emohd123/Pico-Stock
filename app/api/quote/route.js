import { NextResponse } from 'next/server';
import { getOrderById, updateOrder } from '@/lib/store';
import { createZohoEstimate, getEstimatePDF, markEstimateSent } from '@/lib/zoho';
import { sendQuoteEmail } from '@/lib/email';

export async function POST(request) {
    try {
        const { orderId } = await request.json();
        if (!orderId) {
            return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
        }

        const order = await getOrderById(orderId);
        if (!order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        // ── Create Zoho estimate ──────────────────────────────────────────────
        const { estimate_id, estimate_number } = await createZohoEstimate(order);
        const pdfBuffer = await getEstimatePDF(estimate_id);
        await markEstimateSent(estimate_id).catch(() => {});

        // ── Send quote email to customer ───────────────────────────
        const customerEmail = order.exhibitor?.email;
        const adminEmail = process.env.ADMIN_EMAIL || 'ebrahim@picobahrain.com';

        await sendQuoteEmail({
            order,
            pdfBuffer,
            estimateNumber: estimate_number,
            toEmail: customerEmail || adminEmail,
            ccEmail: customerEmail ? adminEmail : null,
        });

        // ── Persist Zoho ID + mark order as quoted ────────────────────────────
        await updateOrder(orderId, { zoho_quote_id: estimate_id, status: 'quoted' });

        console.log(`Quote sent: ${estimate_number} for order ${orderId}`);
        return NextResponse.json({ success: true, estimate_id, estimate_number });

    } catch (err) {
        console.error('Quote generation error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
