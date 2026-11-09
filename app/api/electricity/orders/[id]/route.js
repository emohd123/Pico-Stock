import { NextResponse } from 'next/server';
import {
    ElectricityStoreError,
    bahrainStamp,
    deleteElectricityOrder,
    getElectricityOrderById,
    priceOrder,
    setElectricityOrderDiscount,
    updateElectricityOrder,
} from '@/lib/electricityOrderStore';
import { formatMoney } from '@/lib/eventMarketplacePricing';

export const dynamic = 'force-dynamic';

// Admin-only (middleware).

/** Body: { adminNotes } or { discount: { percent, note } } (percent 0 removes it). */
export async function PATCH(request, { params }) {
    try {
        const order = await getElectricityOrderById(params.id);
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        const body = await request.json().catch(() => ({}));
        if (body.discount) {
            const percent = Number(body.discount.percent);
            const note = String(body.discount.note || '').trim().slice(0, 200);
            const before = formatMoney(order.total, order.currency);
            const after = formatMoney(priceOrder(order.items, order.surcharge, order.vat?.percent, { percent }).total, order.currency);
            const updated = await setElectricityOrderDiscount(order, { percent, note }, percent
                ? `Discount ${percent}% applied${note ? ` (${note})` : ''}: total ${before} → ${after}, ${bahrainStamp()}.`
                : `Discount removed: total ${before} → ${after}, ${bahrainStamp()}.`);
            return NextResponse.json({ order: updated });
        }
        const updated = await updateElectricityOrder(order, { adminNotes: String(body.adminNotes ?? order.adminNotes) });
        return NextResponse.json({ order: updated });
    } catch (error) {
        if (error instanceof ElectricityStoreError) return NextResponse.json({ error: error.message }, { status: error.status });
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
