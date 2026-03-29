import { NextResponse } from 'next/server';
import { getStandDesignAiStatus } from '@/lib/standDesignAi';
import { getStandDesignMaintenanceStatus } from '@/lib/standDesignMaintenance';
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
            maintenance: getStandDesignMaintenanceStatus(),
        });
    } catch (error) {
        return NextResponse.json({
            items: [],
            ai: getStandDesignAiStatus(),
            storage: getStandDesignStorageStatus(),
            maintenance: getStandDesignMaintenanceStatus(),
            warning: 'Saved stand designs are temporarily unavailable. You can still create a new concept.',
            error: 'Failed to fetch stand designs',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
