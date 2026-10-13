import { NextResponse } from 'next/server';
import { deleteElectricityOrder, getElectricityOrderById, updateElectricityOrder } from '@/lib/electricityOrderStore';

export const dynamic = 'force-dynamic';

// Admin-only (middleware).

/** Body: { adminNotes } */
export async function PATCH(request, { params }) {
    try {
        const order = await getElectricityOrderById(params.id);
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        const body = await request.json().catch(() => ({}));
        const updated = await updateElectricityOrder(order, { adminNotes: String(body.adminNotes ?? order.adminNotes) });
        return NextResponse.json({ order: updated });
    } catch (error) {
        console.error('Electricity order update failed:', error);
        return NextResponse.json({ error: 'Failed to update the order' }, { status: 500 });
    }
}

export async function DELETE(_request, { params }) {
    try {
        const removed = await deleteElectricityOrder(params.id);
        return removed ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Order not found' }, { status: 404 });
    } catch (error) {
        console.error('Electricity order delete failed:', error);
        return NextResponse.json({ error: 'Failed to delete the order' }, { status: 500 });
    }
}
