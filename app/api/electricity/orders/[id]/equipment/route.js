import { NextResponse } from 'next/server';
import { getElectricityOrderById } from '@/lib/electricityOrderStore';
import { signedEquipmentUrl } from '@/lib/electricityFiles';

export const dynamic = 'force-dynamic';

// Admin-only (middleware): open a vendor's equipment list.
export async function GET(_request, { params }) {
    const order = await getElectricityOrderById(params.id);
    if (!order?.equipment?.path) return NextResponse.json({ error: 'No equipment list on this order.' }, { status: 404 });
    try {
        return NextResponse.redirect(await signedEquipmentUrl(order.equipment.path));
    } catch (error) {
        console.error('Equipment list link failed:', error);
        return NextResponse.json({ error: 'Could not open the file.' }, { status: 500 });
    }
}
