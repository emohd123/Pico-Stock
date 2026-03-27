import { NextResponse } from 'next/server';
import { generateDraftWithAi } from '@/lib/quotationAi';

export const runtime = 'nodejs';

export async function POST(request) {
    try {
        const payload = await request.json();
        const result = await generateDraftWithAi({
            quotation: payload.quotation || {},
            brief: payload.brief || '',
            files: Array.isArray(payload.files) ? payload.files : [],
            mode: payload.mode === 'duplicate' ? 'duplicate' : 'draft',
        });
        return NextResponse.json(result);
    } catch (error) {
        console.error('[quotation ai draft] failed:', error);
        return NextResponse.json({ error: 'Failed to generate AI draft' }, { status: 500 });
    }
}
