import { NextResponse } from 'next/server';
import { suggestPricingWithAi } from '@/lib/quotationAi';

export const runtime = 'nodejs';

export async function POST(request) {
    try {
        const payload = await request.json();
        const result = await suggestPricingWithAi({
            quotation: payload.quotation || {},
        });
        return NextResponse.json(result);
    } catch (error) {
        console.error('[quotation ai pricing] failed:', error);
        return NextResponse.json({ error: 'Failed to prepare AI pricing suggestions' }, { status: 500 });
    }
}
