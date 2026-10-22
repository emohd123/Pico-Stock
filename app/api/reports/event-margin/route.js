import { NextResponse } from 'next/server';
import { EVENT_MARKETPLACE_DEFAULTS, getEventMarketplace, listEventRequests, saveEventMarketplace } from '@/lib/eventMarketplaceStore';
import { buildMarginReport } from '@/lib/eventMarginReport';
import { getProducts } from '@/lib/store';

export const dynamic = 'force-dynamic';

async function loadReport() {
    const slugs = Object.keys(EVENT_MARKETPLACE_DEFAULTS);
    const [products, events] = await Promise.all([
        getProducts(),
        Promise.all(slugs.map(async (slug) => {
            const config = await getEventMarketplace(slug);
            const requests = config ? await listEventRequests(slug) : [];
            return config ? { config, requests } : null;
        })),
    ]);
    return buildMarginReport(events.filter(Boolean), products);
}

/** Admin-only (see middleware): margin on confirmed event requests, by supplier and client. */
export async function GET() {
    try {
        return NextResponse.json(await loadReport(), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Margin report failed:', error);
        return NextResponse.json({ error: 'Failed to build the margin report' }, { status: 500 });
    }
}

/** Admin-only: set an event's client share % and return the recalculated report. */
export async function POST(request) {
    try {
        const body = await request.json().catch(() => ({}));
        const eventId = String(body.eventId || '');
        const percent = Number(body.clientSharePercent);
        if (!EVENT_MARKETPLACE_DEFAULTS[eventId]) {
            return NextResponse.json({ error: 'Unknown event' }, { status: 404 });
        }
        if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
            return NextResponse.json({ error: 'Client % must be between 0 and 100.' }, { status: 400 });
        }
        await saveEventMarketplace(eventId, { clientSharePercent: percent });
        return NextResponse.json(await loadReport(), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Saving client share failed:', error);
        return NextResponse.json({ error: 'Could not save the client %' }, { status: 500 });
    }
}
