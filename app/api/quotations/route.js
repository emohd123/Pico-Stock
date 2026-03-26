import { NextResponse } from 'next/server';
import { createQuotation, getQuotations, QuotationStoreError } from '@/lib/quotationStore';

export const runtime = 'nodejs';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const sourceType = searchParams.get('source_type') || '';

    try {
        const quotations = await getQuotations({ search, status, sourceType });
        return NextResponse.json(quotations);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch quotations' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const quotation = await createQuotation(body);
        return NextResponse.json(quotation, { status: 201 });
    } catch (error) {
        if (error instanceof QuotationStoreError) {
            return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
        }
        return NextResponse.json({ error: 'Failed to create quotation' }, { status: 500 });
    }
}
