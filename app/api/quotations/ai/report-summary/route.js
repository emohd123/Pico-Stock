import { NextResponse } from 'next/server';
import { summarizeReportWithAi } from '@/lib/quotationAi';

export const runtime = 'nodejs';

export async function POST(request) {
    try {
        const payload = await request.json();
        const result = await summarizeReportWithAi({
            report: payload.report || null,
        });
        return NextResponse.json(result);
    } catch (error) {
        console.error('[quotation ai report summary] failed:', error);
        return NextResponse.json({ error: 'Failed to summarize report with AI' }, { status: 500 });
    }
}
