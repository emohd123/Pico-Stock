import { NextResponse } from 'next/server';
import { duplicateQuotation } from '@/lib/quotationStore';

export const runtime = 'nodejs';

export async function POST(_request, { params }) {
    try {
        const quotation = await duplicateQuotation(params.id);
        if (!quotation) {
            return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
        }

        return NextResponse.json(quotation, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to duplicate quotation' }, { status: 500 });
    }
}
