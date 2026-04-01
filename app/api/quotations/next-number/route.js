import { NextResponse } from 'next/server';
import { getNextQuotationNumber, setNextQuotationNumber } from '@/lib/quotationStore';

export const runtime = 'nodejs';

export async function GET() {
    try {
        const qt_number = await getNextQuotationNumber();
        return NextResponse.json({ qt_number });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch the next quotation number' }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const body = await request.json();
        const value = Number(body?.qt_number);
        if (!Number.isFinite(value) || value < 1) {
            return NextResponse.json({ error: 'qt_number must be a positive integer' }, { status: 400 });
        }
        const qt_number = await setNextQuotationNumber(value);
        return NextResponse.json({ qt_number });
    } catch (error) {
        return NextResponse.json({ error: error.message || 'Failed to update quotation number' }, { status: error.status || 500 });
    }
}
