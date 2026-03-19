import { NextResponse } from 'next/server';
import { getNextQuotationNumber } from '@/lib/quotationStore';

export const runtime = 'nodejs';

export async function GET() {
    try {
        const qt_number = await getNextQuotationNumber();
        return NextResponse.json({ qt_number });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch the next quotation number' }, { status: 500 });
    }
}
