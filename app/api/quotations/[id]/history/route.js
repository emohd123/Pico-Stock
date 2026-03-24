import { NextResponse } from 'next/server';
import { getQuotationHistory } from '@/lib/quotationStore';

export const runtime = 'nodejs';

export async function GET(_request, { params }) {
    try {
        const history = await getQuotationHistory(params.id);
        if (!history) {
            return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
        }

        return NextResponse.json(history);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch quotation history' }, { status: 500 });
    }
}
