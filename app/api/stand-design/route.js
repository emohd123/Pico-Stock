import { NextResponse } from 'next/server';
import { getStandDesignAiStatus } from '@/lib/standDesignAi';
import { getStandDesigns } from '@/lib/standDesignStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const items = await getStandDesigns();
        return NextResponse.json({
            items,
            ai: getStandDesignAiStatus(),
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch stand designs' }, { status: 500 });
    }
}
