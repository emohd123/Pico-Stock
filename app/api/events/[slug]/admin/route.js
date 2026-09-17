import { NextResponse } from 'next/server';
import {
    EventMarketplaceStoreError,
    getEventMarketplace,
    getEventMarketplaceStorageStatus,
    saveEventMarketplace,
} from '@/lib/eventMarketplaceStore';
import { buildEventCatalogue } from '@/lib/eventMarketplacePricing';
import { getProducts } from '@/lib/store';

export const dynamic = 'force-dynamic';

function errorResponse(error, fallback) {
    if (error instanceof EventMarketplaceStoreError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(fallback, error);
    return NextResponse.json({ error: fallback }, { status: 500 });
}

/** Admin view: full configuration plus every catalogue product (hidden ones included). */
export async function GET(_request, { params }) {
    try {
        const config = await getEventMarketplace(params.slug);
        if (!config) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }
        const products = await getProducts().catch(() => []);
        const catalogue = buildEventCatalogue(products, config, { includeHidden: true });
        return NextResponse.json({
            config,
            catalogue,
            storage: getEventMarketplaceStorageStatus(),
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return errorResponse(error, 'Failed to load event configuration');
    }
}

export async function PUT(request, { params }) {
    try {
        const body = await request.json();
        const saved = await saveEventMarketplace(params.slug, body || {});
        const products = await getProducts().catch(() => []);
        const catalogue = buildEventCatalogue(products, saved, { includeHidden: true });
        return NextResponse.json({ success: true, config: saved, catalogue });
    } catch (error) {
        return errorResponse(error, 'Failed to save event configuration');
    }
}
