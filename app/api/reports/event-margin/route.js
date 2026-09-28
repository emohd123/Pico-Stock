import { NextResponse } from 'next/server';
import { EVENT_MARKETPLACE_DEFAULTS, getEventMarketplace, listEventRequests } from '@/lib/eventMarketplaceStore';
import { buildMarginReport } from '@/lib/eventMarginReport';
import { getProducts } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Admin-only (see middleware): margin on confirmed event requests, by supplier and client. */
export async function GET() {
    try {
        const slugs = Object.keys(EVENT_MARKETPLACE_DEFAULTS);
        const [products, events] = await Promise.all([
            getProducts(),
            Promise.all(slugs.map(async (slug) => {
                const config = await getEventMarketplace(slug);
                const requests = config ? await listEventRequests(slug) : [];
                return config ? { config, requests } : null;
            })),
        ]);
        const report = buildMarginReport(events.filter(Boolean), products);
        return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Margin report failed:', error);
        return NextResponse.json({ error: 'Failed to build the margin report' }, { status: 500 });
    }
}
