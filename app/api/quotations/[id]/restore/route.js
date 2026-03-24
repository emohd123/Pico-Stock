import { NextResponse } from 'next/server';
import { QuotationStoreError, restoreQuotationVersion } from '@/lib/quotationStore';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
    try {
        const body = await request.json();
        const quotation = await restoreQuotationVersion(params.id, body?.version);

        if (!quotation) {
            return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
        }

        return NextResponse.json(quotation);
    } catch (error) {
        if (error instanceof QuotationStoreError) {
            return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
        }
        return NextResponse.json({ error: 'Failed to restore quotation version' }, { status: 500 });
    }
}
