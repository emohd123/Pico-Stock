import { NextResponse } from 'next/server';
import {
    EventMarketplaceStoreError,
    deleteEventRequest,
    getEventRequestById,
    updateEventRequest,
} from '@/lib/eventMarketplaceStore';

export const dynamic = 'force-dynamic';

function errorResponse(error, fallback) {
    if (error instanceof EventMarketplaceStoreError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(fallback, error);
    return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(_request, { params }) {
    try {
        const found = await getEventRequestById(params.slug, params.id);
        if (!found) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
        return NextResponse.json(found, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return errorResponse(error, 'Failed to load request');
    }
}

export async function PUT(request, { params }) {
    try {
        const body = await request.json().catch(() => ({}));
        const updated = await updateEventRequest(params.slug, params.id, body || {});
        if (!updated) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
        return NextResponse.json({ success: true, request: updated });
    } catch (error) {
        return errorResponse(error, 'Failed to update request');
    }
}

export async function DELETE(_request, { params }) {
    try {
        const removed = await deleteEventRequest(params.slug, params.id);
        if (!removed) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (error) {
        return errorResponse(error, 'Failed to delete request');
    }
}
