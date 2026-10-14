import { NextResponse } from 'next/server';
import {
    ElectricityStoreError,
    createElectricityOrder,
    getElectricityForm,
    listElectricityOrders,
    resolveLines,
} from '@/lib/electricityOrderStore';
import { sendNewOrderEmails } from '@/lib/electricityOrderEmails';
import { equipmentAttachment, readOrderRequest, storeEquipmentFile } from '@/lib/electricityFiles';

export const dynamic = 'force-dynamic';

/** Admin (middleware): every electricity order, newest first. */
export async function GET() {
    try {
        return NextResponse.json(await listElectricityOrders(), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Electricity orders load failed:', error);
        return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 });
    }
}

/**
 * Public: a vendor submits the form, as multipart form data: "payload" (JSON
 * { vendor, items: [{ id, quantity }] }) and "equipment" (the required
 * equipment list file). Prices always come from the live form.
 */
export async function POST(request) {
    try {
        const form = await getElectricityForm();
        if (form.status !== 'open') {
            return NextResponse.json({ error: 'This form is not accepting orders at the moment. Please contact Pico.' }, { status: 403 });
        }
        const { body, file } = await readOrderRequest(request);
        const lines = resolveLines(form, body.items);
        const order = await createElectricityOrder(form, {
            vendor: body.vendor,
            lines,
            storeEquipment: file ? (draft) => storeEquipmentFile(draft, file) : null,
        });

        const origin = new URL(request.url).origin;
        const orderUrl = `${origin}/electricity/order/${order.orderKey}`;
        let warning = null;
        try {
            const attachment = await equipmentAttachment(order.equipment).catch(() => null);
            const sent = await sendNewOrderEmails({ form, order, orderUrl, adminUrl: `${origin}/admin/electricity`, equipmentAttachment: attachment });
            if (!sent.vendor.success) warning = 'Your order is saved, but we could not email you the confirmation. Keep your order number.';
            else if (!sent.pico.success) console.error('[electricity] Pico notification failed:', sent.pico.error);
        } catch (error) {
            console.error('[electricity] order emails failed:', error);
            warning = 'Your order is saved, but we could not email you the confirmation. Keep your order number.';
        }
        return NextResponse.json({ success: true, reference: order.reference, orderUrl: `/electricity/order/${order.orderKey}`, warning });
    } catch (error) {
        if (error instanceof ElectricityStoreError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Electricity order failed:', error);
        return NextResponse.json({ error: 'The order could not be sent. Please try again.' }, { status: 500 });
    }
}
