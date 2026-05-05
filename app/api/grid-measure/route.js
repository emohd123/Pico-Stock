import { NextResponse } from 'next/server';
import {
    createGridMeasureProject,
    getGridMeasureProjects,
    getGridMeasureStorageStatus,
} from '@/lib/gridMeasureStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const items = await getGridMeasureProjects();
        return NextResponse.json({ items, storage: getGridMeasureStorageStatus() });
    } catch (error) {
        return NextResponse.json({
            items: [],
            storage: getGridMeasureStorageStatus(),
            error: 'Failed to fetch grid measure projects',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const payload = await request.json();
        const item = await createGridMeasureProject(payload);
        return NextResponse.json({ success: true, item }, { status: 201 });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create grid measure project',
        }, { status: error?.status || 500 });
    }
}
