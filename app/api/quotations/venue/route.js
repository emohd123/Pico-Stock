import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/ministry/auth';
import { setQuotationVenues, logActivity } from '@/lib/ministry/queries';
import { canonicalVenue, VENUE_UNKNOWN } from '@/lib/ministry/venues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Admin decides (or changes) where a meeting is held. The venue drives the whole
// season plan — two meetings at one venue share a build, two at different venues
// need two — so this is the single edit that can resolve a shortfall without
// spending anything, and it writes to every quotation of that meeting.
export async function POST(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const { ministryId, quotationIds, venue } = await req.json();
    if (!Array.isArray(quotationIds) || !quotationIds.length) return new NextResponse('Bad request', { status: 400 });

    const clean = String(venue || '').trim().slice(0, 120);
    const n = await setQuotationVenues(quotationIds, clean);
    const shown = canonicalVenue(clean);
    await logActivity({
        ministryId: Number(ministryId) || null,
        quotationId: Number(quotationIds[0]) || null,
        actor: 'admin',
        action: shown === VENUE_UNKNOWN ? 'venue.cleared' : 'venue.set',
        detail: shown === VENUE_UNKNOWN
            ? `Venue cleared on ${n} quotation${n === 1 ? '' : 's'} — planning treats it as undecided again`
            : `Venue set to ${shown} on ${n} quotation${n === 1 ? '' : 's'}`,
    });
    return NextResponse.json({ ok: true, venue: shown, updated: n });
}
