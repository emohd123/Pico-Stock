import { NextResponse } from 'next/server';
import { ElectricityStoreError, getElectricityForm, saveElectricityForm } from '@/lib/electricityOrderStore';

export const dynamic = 'force-dynamic';

// Admin-only (middleware): the full form configuration.

export async function GET() {
    try {
        return NextResponse.json({ form: await getElectricityForm() }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Electricity form load failed:', error);
        return NextResponse.json({ error: 'Failed to load the form' }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        const body = await request.json().catch(() => ({}));
        return NextResponse.json({ form: await saveElectricityForm(body.form || {}) });
    } catch (error) {
        if (error instanceof ElectricityStoreError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Electricity form save failed:', error);
        return NextResponse.json({ error: 'Failed to save the form' }, { status: 500 });
    }
}
