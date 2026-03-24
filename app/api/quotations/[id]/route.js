import { NextResponse } from 'next/server';
import { deleteQuotation, getQuotationById, QuotationStoreError, updateQuotation } from '@/lib/quotationStore';

export const runtime = 'nodejs';

export async function GET(_request, { params }) {
    try {
        const quotation = await getQuotationById(params.id);
        if (!quotation) {
            return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
        }

        return NextResponse.json(quotation);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch quotation' }, { status: 500 });
    }
}

export async function PUT(request, { params }) {
    try {
        const body = await request.json();
        const quotation = await updateQuotation(params.id, body);

        if (!quotation) {
            return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
        }

        return NextResponse.json(quotation);
    } catch (error) {
        if (error instanceof QuotationStoreError) {
            return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
        }
        return NextResponse.json({ error: 'Failed to update quotation' }, { status: 500 });
    }
}

export async function DELETE(_request, { params }) {
    try {
        const deleted = await deleteQuotation(params.id);
        if (!deleted) {
            return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete quotation' }, { status: 500 });
    }
}
