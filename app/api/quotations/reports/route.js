import { NextResponse } from 'next/server';
import { getQuotationReportSource } from '@/lib/quotationStore';
import { buildQuotationReport } from '@/lib/quotationReports';

export const runtime = 'nodejs';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const quotations = await getQuotationReportSource();
        const payload = buildQuotationReport(quotations, {
            from: searchParams.get('from') || '',
            to: searchParams.get('to') || '',
            status: searchParams.get('status') || '',
            owner: searchParams.get('owner') || '',
            customer: searchParams.get('customer') || '',
        });

        return NextResponse.json(payload);
    } catch (error) {
        console.error('[quotation reports] failed:', error);
        return NextResponse.json({ error: 'Failed to load quotation reports' }, { status: 500 });
    }
}
