import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/ministry/auth';
import { putPrivate } from '@/lib/ministry/storage';
import {
    getMinistryById, getActiveCatalog, reserveMinistryQuoteRef, getMinistryQuotations,
    createQuotation, insertQuotationLines, setQuotationPdfUrl,
} from '@/lib/ministry/queries';
import { computeTotals, lineTotal } from '@/lib/ministry/money';
import { appendQuoteRow } from '@/lib/ministry/quoteLog';
import { COMPANY } from '@/lib/ministry/company';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// Serverless request bodies are capped around 4.5MB, so promising more would
// just fail at the edge. Generated quotations are ~60KB; scans are a few MB.
const MAX = 4 * 1024 * 1024;

/**
 * Record a quotation that was produced outside the portal: the admin uploads the
 * PDF and states the event details and items. The result is an ordinary
 * quotation row — same ref, revision, totals and lines as a generated one — so
 * the calendar, Production page, share link and presentation all work on it.
 */
export async function POST(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });

    const form = await req.formData();
    const ministryId = Number(form.get('ministryId'));
    const file = form.get('file');
    if (!ministryId || !(file instanceof File)) return new NextResponse('Bad request', { status: 400 });
    if (file.type !== 'application/pdf') return new NextResponse('Please upload a PDF file', { status: 400 });
    if (file.size > MAX) return new NextResponse('PDF too large (max 4MB)', { status: 400 });

    const ministry = await getMinistryById(ministryId);
    if (!ministry) return new NextResponse('Ministry not found', { status: 404 });

    const str = (k, n) => String(form.get(k) || '').slice(0, n).trim();
    const eventName = str('eventName', 200);
    const venue = str('venue', 200);
    const eventDate = str('eventDate', 200);
    const duration = str('duration', 200);
    const customRef = str('ref', 80);

    let picked;
    try { picked = JSON.parse(String(form.get('items') || '[]')); } catch { picked = []; }
    if (!Array.isArray(picked) || picked.length === 0) return new NextResponse('Select at least one item', { status: 400 });

    const catalog = await getActiveCatalog();
    const byId = new Map(catalog.map((c) => [c.id, c]));
    // Unlike the portal, quantities are NOT clamped to the catalogue default —
    // this is transcribing a document that already exists, so it must be able to
    // say what the document says.
    const resolved = picked
        .map((p) => {
            const item = byId.get(Number(p.itemId));
            if (!item) return null;
            const qty = Math.max(1, parseInt(p.qty, 10) || 1);
            return { item, qty, lineTotalFils: lineTotal(item.unitPriceFils, qty) };
        })
        .filter(Boolean)
        .sort((a, b) => a.item.itemNo - b.item.itemNo);
    if (resolved.length === 0) return new NextResponse('No valid items', { status: 400 });

    const totals = computeTotals(resolved.map((r) => r.lineTotalFils));

    // An uploaded PDF usually carries its own printed reference, possibly from an
    // earlier month. When one is given, use it verbatim and do NOT reserve — that
    // would mint a fresh number and pin it to the ministry permanently, which is
    // wrong when the real number is the one printed on the document.
    const now = new Date();
    const reserved = customRef ? null : await reserveMinistryQuoteRef(ministryId);
    const ref = customRef
        || `${COMPANY.refPrefix}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}/${COMPANY.refDept}/${reserved.ref}`;
    const prior = await getMinistryQuotations(ministryId);

    const quote = await createQuotation({
        ministryId, ref, eventName, venue, eventDate, duration,
        revision: prior.length + 1,
        subtotalFils: totals.subtotal, vatFils: totals.vat, totalFils: totals.total,
        termsAgreedAt: null,
        submitterNote: 'Uploaded by PICO admin',
    });

    await insertQuotationLines(quote.id, resolved.map((r) => ({
        itemId: r.item.id, itemNo: r.item.itemNo, nameSnapshot: r.item.name,
        unitPriceFilsSnapshot: r.item.unitPriceFils, qty: r.qty, lineTotalFils: r.lineTotalFils,
    })));

    const bytes = new Uint8Array(await file.arrayBuffer());
    const safeRef = ref.replace(/\//g, '-');
    const stored = await putPrivate(`ministry-quotations/${ministryId}/${safeRef}.pdf`, bytes, 'application/pdf');
    await setQuotationPdfUrl(quote.id, stored.url);

    // Only a freshly minted number is new to the master sheet; a reference typed
    // from an existing document is already logged there.
    if (reserved && reserved.isNew) {
        await appendQuoteRow([
            ref, ministry.name, eventName || '',
            now.toLocaleDateString('en-GB'),
            (totals.total / 1000).toFixed(3),
        ]);
    }

    return NextResponse.json({ ok: true, id: quote.id, ref, totalFils: totals.total });
}
