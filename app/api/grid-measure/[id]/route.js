import { NextResponse } from 'next/server';
import {
    deleteGridMeasureProject,
    getGridMeasureProjectById,
    updateGridMeasureProject,
} from '@/lib/gridMeasureStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
    try {
        const item = await getGridMeasureProjectById(params.id);
        if (!item) return NextResponse.json({ error: 'Grid measure project not found' }, { status: 404 });
        return NextResponse.json({ item });
    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Failed to fetch grid measure project',
        }, { status: 500 });
    }
}

export async function PUT(request, { params }) {
    try {
        const payload = await request.json();
        const item = await updateGridMeasureProject(params.id, payload);
        if (!item) return NextResponse.json({ success: false, error: 'Grid measure project not found' }, { status: 404 });
        return NextResponse.json({ success: true, item });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update grid measure project',
        }, { status: error?.status || 500 });
    }
}

export async function DELETE(_request, { params }) {
    try {
        const deleted = await deleteGridMeasureProject(params.id);
        if (!deleted) return NextResponse.json({ success: false, error: 'Grid measure project not found' }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete grid measure project',
        }, { status: error?.status || 500 });
    }
}
