import { NextResponse } from 'next/server';
import { getOrders, addOrder, updateOrder, getOrderById, deleteOrder } from '@/lib/store';
import { createQuotationFromOrder } from '@/lib/quotationStore';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (id) {
            const order = await getOrderById(id);
            if (!order) {
                return NextResponse.json({ error: 'Order not found' }, { status: 404 });
            }
            return NextResponse.json(order);
        }

        const orders = await getOrders();
        return NextResponse.json(orders);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();

        const order = {
            id: `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            items: body.items,
            exhibitor: body.exhibitor,
            total: body.total,
            days: body.days || 1,
            grandTotal: body.grandTotal ?? (body.total * (body.days || 1)),
            attachments: body.attachments || [],
            status: 'pending',
            notes: body.exhibitor?.notes || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        const created = await addOrder(order);
        const quotation = await createQuotationFromOrder(created, { reuseExisting: true });
        const linkedOrder = await updateOrder(created.id, {
            quotationId: quotation.id,
            quotationQtNumber: quotation.qt_number,
            quotationStatus: quotation.status,
            quotationSentAt: quotation.email_sent_at || null,
            quotationConfirmedAt: quotation.confirmed_at || null,
        });

        return NextResponse.json({ success: true, order: linkedOrder || created, quotation });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'Order ID required' }, { status: 400 });
        await deleteOrder(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete order' }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: 'Order ID required' }, { status: 400 });
        }

        updates.updatedAt = new Date().toISOString();
        const updated = await updateOrder(id, updates);

        if (!updated) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, order: updated });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
    }
}
