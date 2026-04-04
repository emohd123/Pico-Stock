import { NextResponse } from 'next/server';
import { getOrders, addOrder, updateOrder, getOrderById, deleteOrder } from '@/lib/store';
import { createQuotationFromOrder } from '@/lib/quotationStore';

function normalizeOrderItems(items) {
    if (!Array.isArray(items)) return [];

    return items
        .filter((item) => item && item.id)
        .map((item) => {
            const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
            const price = Number(item.price) || 0;

            return {
                id: String(item.id),
                name: String(item.name || '').trim(),
                price,
                quantity,
                category: String(item.category || 'furniture'),
                image: String(item.image || ''),
                comment: String(item.comment || '').trim(),
            };
        });
}

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
        const items = normalizeOrderItems(body.items);
        const exhibitor = body.exhibitor && typeof body.exhibitor === 'object' ? body.exhibitor : {};

        if (items.length === 0) {
            return NextResponse.json({ error: 'At least one order item is required' }, { status: 400 });
        }

        if (!exhibitor.name || !exhibitor.company || !exhibitor.email || !exhibitor.phone) {
            return NextResponse.json({ error: 'Missing required exhibitor details' }, { status: 400 });
        }

        const days = Math.max(1, parseInt(body.days, 10) || 1);
        const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        const order = {
            id: `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            items,
            exhibitor,
            total,
            days,
            grandTotal: total * days,
            attachments: Array.isArray(body.attachments) ? body.attachments : [],
            status: 'pending',
            notes: exhibitor?.notes || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        const created = await addOrder(order);
        let responseOrder = created;
        let quotation = null;
        let warning = null;

        try {
            quotation = await createQuotationFromOrder(created, { reuseExisting: true });
            const linkedOrder = await updateOrder(created.id, {
                quotationId: quotation.id,
                quotationQtNumber: quotation.qt_number,
                quotationStatus: quotation.status,
                quotationSentAt: quotation.email_sent_at || null,
                quotationConfirmedAt: quotation.confirmed_at || null,
            });
            responseOrder = linkedOrder || created;
        } catch (quotationError) {
            console.error('Automatic quotation creation failed:', quotationError);
            warning = 'Order saved, but quotation draft creation failed.';
        }

        return NextResponse.json({ success: true, order: responseOrder, quotation, warning });
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
