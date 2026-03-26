import { NextResponse } from 'next/server';
import { getOrderById, updateOrder } from '@/lib/store';
import { createQuotationFromOrder, QuotationStoreError } from '@/lib/quotationStore';

export const runtime = 'nodejs';

export async function POST(request) {
    try {
        const body = await request.json();
        const orderId = String(body.orderId || '');

        if (!orderId) {
            return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
        }

        const order = await getOrderById(orderId);
        if (!order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        const quotation = await createQuotationFromOrder(order, { reuseExisting: body.reuseExisting !== false });
        await updateOrder(order.id, {
            quotationId: quotation.id,
            quotationQtNumber: quotation.qt_number,
            quotationStatus: quotation.status,
            quotationSentAt: quotation.email_sent_at || null,
            quotationConfirmedAt: quotation.confirmed_at || null,
        });

        return NextResponse.json(quotation, { status: 201 });
    } catch (error) {
        if (error instanceof QuotationStoreError) {
            return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
        }
        return NextResponse.json({ error: 'Failed to create quotation from order' }, { status: 500 });
    }
}
