import { NextResponse } from 'next/server';
import { getReviewInsights } from '@/lib/pcloud/insightsService';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await getReviewInsights();
        return NextResponse.json({ success: true, ...data });
    } catch (error) {
        console.error('Review insights error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
