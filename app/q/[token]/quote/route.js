import { NextResponse } from 'next/server';
import { getMinistryByToken, getActiveCatalog, nextQuotationRef, getMinistryQuotations, createQuotation, insertQuotationLines, setQuotationPdfUrl } from '@/lib/ministry/queries';
import { computeTotals, lineTotal } from '@/lib/ministry/money';
import { itemDetail } from '@/lib/ministry/itemDetails';
import { renderQuotationPdf } from '@/components/ministry/QuotationPdf';
import { putPrivate } from '@/lib/ministry/storage';

export const runtime = 'nodejs';

export async function POST(req, { params }) {
    const { token } = params;
    const ministry = await getMinistryByToken(token);
    if (!ministry) return new NextResponse('Not found', { status: 404 });

    let body;
    try { body = await req.json(); } catch { return new NextResponse('Invalid request', { status: 400 }); }
    const eventName = String(body?.eventName || '').slice(0, 200);
    const venue = String(body?.venue || '').slice(0, 200);
    const eventDate = String(body?.eventDate || '').slice(0, 200);
    const rawLines = Array.isArray(body?.lines) ? body.lines : [];
    if (rawLines.length === 0) return new NextResponse('No items', { status: 400 });

    const catalog = await getActiveCatalog();
    const byId = new Map(catalog.map((c) => [c.id, c]));

    const resolved = rawLines
        .map((l) => {
            const item = byId.get(Number(l.itemId));
            if (!item) return null;
            const reqQty = Math.max(1, parseInt(l.qty, 10) || 1);
            const qty = item.qtyFixed ? item.defaultQty : Math.min(item.defaultQty, reqQty);
            return { item, qty, lineTotalFils: lineTotal(item.unitPriceFils, qty) };
        })
        .filter(Boolean)
        .sort((a, b) => a.item.itemNo - b.item.itemNo);

    if (resolved.length === 0) return new NextResponse('No valid items', { status: 400 });

    const totals = computeTotals(resolved.map((r) => r.lineTotalFils));
    const ref = await nextQuotationRef();
    const prior = await getMinistryQuotations(ministry.id);
    const revision = prior.length + 1;

    const quote = await createQuotation({
        ministryId: ministry.id, ref, eventName, venue, eventDate, revision,
        subtotalFils: totals.subtotal, vatFils: totals.vat, totalFils: totals.total,
    });

    await insertQuotationLines(quote.id, resolved.map((r) => ({
        itemId: r.item.id, itemNo: r.item.itemNo, nameSnapshot: r.item.name,
        unitPriceFilsSnapshot: r.item.unitPriceFils, qty: r.qty, lineTotalFils: r.lineTotalFils,
    })));

    const pdf = await renderQuotationPdf({
        ref,
        dateStr: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
        ministryName: ministry.name,
        attentionName: ministry.attentionName, attentionTitle: ministry.attentionTitle, poBox: ministry.poBox,
        eventName, venue, eventDate,
        lines: resolved.map((r) => {
            const d = itemDetail(r.item.itemNo);
            return {
                scope: (d && d.scope) || r.item.name,
                mainDesc: (d && d.mainDesc) || r.item.description,
                qty: r.qty, unit: r.item.unit, unitPriceFils: r.item.unitPriceFils,
                lineTotalFils: r.lineTotalFils, subs: (d && d.subs) || [],
            };
        }),
        subtotalFils: totals.subtotal, vatFils: totals.vat, totalFils: totals.total,
    });

    const safeRef = ref.replace(/\//g, '-');
    const stored = await putPrivate(`ministry-quotations/${ministry.id}/${safeRef}.pdf`, pdf, 'application/pdf');
    await setQuotationPdfUrl(quote.id, stored.url);

    return NextResponse.json({ id: quote.id, ref, pdfUrl: `/q/${token}/quote/${quote.id}/pdf` });
}
