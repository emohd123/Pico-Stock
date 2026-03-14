import { NextResponse } from 'next/server';
import { getHealthInsights } from '@/lib/pcloud/insightsService';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await getHealthInsights();
        return NextResponse.json({ success: true, ...data });
    } catch (error) {
        console.error('Health insights error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
