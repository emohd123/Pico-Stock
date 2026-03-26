import { NextResponse } from 'next/server';
import { reviewQuotationWithAi } from '@/lib/quotationAi';

export const runtime = 'nodejs';

export async function POST(request) {
    try {
        const payload = await request.json();
        const result = await reviewQuotationWithAi({
            quotation: payload.quotation || {},
            brief: payload.brief || '',
            files: Array.isArray(payload.files) ? payload.files : [],
        });
        return NextResponse.json(result);
    } catch (error) {
        console.error('[quotation ai review] failed:', error);
        return NextResponse.json({ error: 'Failed to review quotation with AI' }, { status: 500 });
    }
}
