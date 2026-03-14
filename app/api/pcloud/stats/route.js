import { NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/pcloud/insightsService';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await getDashboardStats();
        return NextResponse.json({
            success: true,
            ...data,
        });
    } catch (error) {
        console.error('Stats error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
