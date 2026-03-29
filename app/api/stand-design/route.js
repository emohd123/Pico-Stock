import { NextResponse } from 'next/server';
import { getStandDesignAiStatus } from '@/lib/standDesignAi';
import { getStandDesigns, getStandDesignStorageStatus } from '@/lib/standDesignStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const items = await getStandDesigns();
        return NextResponse.json({
            items,
            ai: getStandDesignAiStatus(),
            storage: getStandDesignStorageStatus(),
        });
    } catch (error) {
        return NextResponse.json({
            items: [],
            ai: getStandDesignAiStatus(),
            storage: getStandDesignStorageStatus(),
            warning: 'Saved stand designs are temporarily unavailable. You can still create a new concept.',
            error: 'Failed to fetch stand designs',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
