import { NextResponse } from 'next/server';
import { getElectricityOrderByKey } from '@/lib/electricityOrderStore';
import { signedEquipmentUrl } from '@/lib/electricityFiles';

export const dynamic = 'force-dynamic';

/** The vendor downloads the equipment list they uploaded (secured by the order key). */
export async function GET(_request, { params }) {
    const order = await getElectricityOrderByKey(params.key);
    if (!order?.equipment?.path) return NextResponse.json({ error: 'No equipment list on this order.' }, { status: 404 });
    try {
        return NextResponse.redirect(await signedEquipmentUrl(order.equipment.path, 120, order.equipment.name));
    } catch (error) {
        console.error('Equipment list link failed:', error);
        return NextResponse.json({ error: 'Could not open the file.' }, { status: 500 });
    }
}
