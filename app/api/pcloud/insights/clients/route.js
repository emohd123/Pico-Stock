import { NextResponse } from 'next/server';
import { getClientInsights } from '@/lib/pcloud/insightsService';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await getClientInsights();
        return NextResponse.json({ success: true, ...data });
    } catch (error) {
        console.error('Client insights error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
