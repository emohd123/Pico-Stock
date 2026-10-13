import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminCookieName, verifyAdminSessionToken } from '@/lib/adminAuth';
import { getElectricityForm, publicForm } from '@/lib/electricityOrderStore';

export const dynamic = 'force-dynamic';

/** Public: the electricity order form as vendors see it. Admins may preview a draft. */
export async function GET() {
    try {
        const form = await getElectricityForm();
        const isAdmin = await verifyAdminSessionToken(cookies().get(getAdminCookieName())?.value || '');
        return NextResponse.json({ form: publicForm(form), preview: isAdmin && form.status !== 'open' }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Electricity form load failed:', error);
        return NextResponse.json({ error: 'The form could not be loaded. Please try again.' }, { status: 500 });
    }
}
