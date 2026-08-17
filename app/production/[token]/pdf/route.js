import { NextResponse } from 'next/server';
import {
    getQuotationByShareToken, getMinistryById, getQuotationLines, getMinistryQuotations,
    getProductionAssignments,
} from '@/lib/ministry/queries';
import { isProductionItem, deriveSchedule } from '@/lib/ministry/production';
import { itemImage } from '@/lib/ministry/itemImages';
import { fmtIso } from '@/components/ministry/ClashNotice';
import { renderProductionSheetPdf, registerArabic } from '@/components/ministry/ProductionSheetPdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Same rule as the page it prints: the token is the access. Anyone who can
// read the sheet can carry it away as a file.

function originFrom(req) {
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('host') || 'localhost:3000';
    return `${proto}://${host}`;
}

// Catalogue photos live in /public, so they come back over the same
// deployment. Downscaled first — a 30-item sheet at full resolution is a
// 20 MB download nobody wants on a phone.
async function thumbUri(origin, path) {
    try {
        const res = await fetch(origin + path, { cache: 'no-store' });
        if (!res.ok) return null;
        let buf = Buffer.from(await res.arrayBuffer());
        try {
            const sharp = (await import('sharp')).default;
            buf = await sharp(buf).resize({ width: 160, withoutEnlargement: true }).png().toBuffer();
            return `data:image/png;base64,${buf.toString('base64')}`;
        } catch {
            const ct = res.headers.get('content-type') || 'image/png';
            return `data:${ct};base64,${buf.toString('base64')}`;
        }
    } catch { return null; }
}

export async function GET(req, { params }) {
    const quote = await getQuotationByShareToken(params.token);
    if (!quote) return new NextResponse('Not found', { status: 404 });

    const [ministry, siblings] = await Promise.all([
        getMinistryById(quote.ministryId),
        getMinistryQuotations(quote.ministryId),
    ]);
    // A meeting can be covered by more than one quotation; the sheet shows all
    // of them, exactly as the page does.
    const meetingQuotes = siblings
        .filter((q) => (q.eventDate || '') === (quote.eventDate || ''))
        .sort((a, b) => a.id - b.id);

    const [overrides, ...lineSets] = await Promise.all([
        getProductionAssignments(meetingQuotes.map((q) => q.id)),
        ...meetingQuotes.map((q) => getQuotationLines(q.id)),
    ]);

    const rows = meetingQuotes.flatMap((q, i) => lineSets[i]
        .filter((l) => isProductionItem(l.itemNo))
        .map((l) => {
            const ov = overrides.get(`${q.id}:${l.itemNo}`) || {};
            return {
                ...l, quoteId: q.id, quoteRef: q.ref,
                title: ov.title || '', selections: ov.selections || [],
            };
        }));

    const sched = deriveSchedule(quote.eventDate);
    const meta = [
        ['Venue', `${quote.venue || '—'}${quote.hall ? ` — ${quote.hall}` : ''}`],
        quote.meetingKind === 'side' ? ['Meeting', 'SIDE MEETING — own room, separate build'] : null,
        sched.setupDay ? ['Setup', fmtIso(sched.setupDay)] : null,
        ['Event', sched.eventDays.length ? sched.eventDays.map(fmtIso).join(', ') : (quote.eventDate || '—')],
        quote.duration ? ['Duration', quote.duration] : null,
        sched.removalStart ? ['Removal', `${fmtIso(sched.removalStart)} (night) – ${fmtIso(sched.removalEnd)}`] : null,
    ].filter(Boolean);

    const origin = originFrom(req);
    registerArabic(origin);
    const img = {};
    await Promise.all([...new Set(rows.map((r) => r.itemNo))].map(async (no) => {
        const p = itemImage(no);
        if (!p) return;
        const uri = await thumbUri(origin, p);
        if (uri) img[no] = uri;
    }));

    const data = {
        ministryName: ministry?.name || 'Meeting',
        eventName: quote.eventName || '',
        ref: quote.ref,
        multi: meetingQuotes.length > 1,
        note: quote.productionNote || '',
        meta,
    };

    const pdf = await renderProductionSheetPdf({ data, rows, img });
    const slug = data.ministryName.replace(/[^A-Za-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return new NextResponse(pdf, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Production-Sheet-${slug}-${String(quote.ref).replace(/\//g, '-')}.pdf"`,
            'Cache-Control': 'no-store',
        },
    });
}
