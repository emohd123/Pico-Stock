import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/ministry/auth';
import { putPrivate, getPrivate, delPrivate } from '@/lib/ministry/storage';
import { getMinistryById, getMinistryQuotations, getQuotationLines, setMinistryPresentation, logActivity } from '@/lib/ministry/queries';
import { PRESENTATION_ITEM_IMAGES, PRESENTATION_ART } from '@/lib/ministry/presentationAssets';
import { renderPresentationPdf } from '@/components/ministry/PresentationPdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Fetch a same-deployment public asset into a data URI (with natural size for
// aspect-correct placement). Returns null on failure so a missing image never
// blocks generation.
async function fetchAsset(origin, path) {
    try {
        const res = await fetch(origin + path, { cache: 'no-store' });
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get('content-type') || (path.endsWith('.png') ? 'image/png' : 'image/jpeg');
        let size = null;
        try {
            const sharp = (await import('sharp')).default;
            const m = await sharp(buf).metadata();
            size = [m.width, m.height];
        } catch { /* size optional */ }
        return { uri: `data:${ct};base64,${buf.toString('base64')}`, size };
    } catch { return null; }
}

function originFrom(req) {
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('host') || 'localhost:3000';
    return `${proto}://${host}`;
}

export async function POST(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const { ministryId } = await req.json();
    const ministry = await getMinistryById(Number(ministryId));
    if (!ministry) return new NextResponse('Ministry not found', { status: 404 });
    const quotes = await getMinistryQuotations(ministry.id);
    if (!quotes.length) return new NextResponse('No quotation yet — generate a quotation first.', { status: 400 });
    const quote = quotes[0];
    const lines = await getQuotationLines(quote.id);
    if (!lines.length) return new NextResponse('The latest quotation has no items.', { status: 400 });

    const origin = originFrom(req);

    // Collect needed images: fixed art + one per quoted item.
    const wanted = { ...PRESENTATION_ART };
    for (const l of lines) {
        const p = PRESENTATION_ITEM_IMAGES[l.itemNo];
        if (p) wanted[`item${l.itemNo}`] = p;
    }
    const img = { __sizes: {} };
    await Promise.all(Object.entries(wanted).map(async ([key, path]) => {
        const a = await fetchAsset(origin, path);
        if (a) { img[key] = a.uri; if (a.size) img.__sizes[key] = a.size; }
    }));

    const pdf = await renderPresentationPdf({ ministry, quote, lines, img });
    const safeRef = String(quote.ref).replace(/\//g, '-');
    const stored = await putPrivate(`ministry-presentations/${ministry.id}/proposal-${safeRef}.pdf`, pdf, 'application/pdf');

    const oldUrl = ministry.presentationUrl;
    await setMinistryPresentation(ministry.id, stored.url, quote.ref);
    if (oldUrl && oldUrl !== stored.url) { try { await delPrivate(oldUrl); } catch { /* ignore */ } }

    await logActivity({
        ministryId: ministry.id, quotationId: quote.id, actor: 'admin', action: 'presentation.generated',
        detail: `Technical proposal presentation ${oldUrl ? 'regenerated' : 'generated'} for ${quote.ref}`,
    });

    return NextResponse.json({ ok: true, ref: quote.ref });
}

export async function GET(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const url = new URL(req.url);
    const ministry = await getMinistryById(Number(url.searchParams.get('ministryId')));
    if (!ministry || !ministry.presentationUrl) return new NextResponse('No presentation generated yet', { status: 404 });
    const file = await getPrivate(ministry.presentationUrl);
    if (!file) return new NextResponse('Not found', { status: 404 });
    const nameSlug = ministry.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const download = url.searchParams.get('download');
    return new NextResponse(file.body, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="Technical-Proposal-${nameSlug}.pdf"`,
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
    });
}
