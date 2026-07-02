import { NextResponse } from 'next/server';
import { getMinistryByToken, getActiveCatalog, reserveMinistryQuoteRef, getMinistryQuotations, createQuotation, insertQuotationLines, setQuotationPdfUrl } from '@/lib/ministry/queries';
import { computeTotals, lineTotal } from '@/lib/ministry/money';
import { itemDetail } from '@/lib/ministry/itemDetails';
import { renderQuotationPdf } from '@/components/ministry/QuotationPdf';
import { putPrivate } from '@/lib/ministry/storage';
import { appendQuoteRow } from '@/lib/ministry/quoteLog';

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
    const duration = String(body?.duration || '').slice(0, 200);
    const address = String(body?.address || '').slice(0, 300);
    const contact1 = String(body?.contact1 || '').slice(0, 120);
    const title1 = String(body?.title1 || '').slice(0, 120);
    const phone1 = String(body?.phone1 || '').slice(0, 60);
    const email1 = String(body?.email1 || '').slice(0, 120);
    const contact2 = String(body?.contact2 || '').slice(0, 120);
    const title2 = String(body?.title2 || '').slice(0, 120);
    const phone2 = String(body?.phone2 || '').slice(0, 60);
    const email2 = String(body?.email2 || '').slice(0, 120);
    const heads = parseInt(body?.heads, 10) > 0 ? parseInt(body.heads, 10) : null;
    // The recipient must accept the Exclusions / Terms / Payment terms before a
    // quotation can be generated — enforced here, not just in the UI.
    if (body?.agreedTerms !== true) return new NextResponse('You must accept the Exclusions, Terms & Conditions and Payment Terms before generating a quotation.', { status: 400 });
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
    // One permanent quotation number per ministry — reused on every regeneration
    // (the revision bumps instead). A brand-new number is minted only the first
    // time this ministry generates, and only then logged to the master sheet.
    const reserved = await reserveMinistryQuoteRef(ministry.id);
    const ref = reserved.ref;
    const prior = await getMinistryQuotations(ministry.id);
    const revision = prior.length + 1;

    const quote = await createQuotation({
        ministryId: ministry.id, ref, eventName, venue, eventDate, duration, revision,
        subtotalFils: totals.subtotal, vatFils: totals.vat, totalFils: totals.total,
        termsAgreedAt: new Date().toISOString(),
    });

    await insertQuotationLines(quote.id, resolved.map((r) => ({
        itemId: r.item.id, itemNo: r.item.itemNo, nameSnapshot: r.item.name,
        unitPriceFilsSnapshot: r.item.unitPriceFils, qty: r.qty, lineTotalFils: r.lineTotalFils,
    })));

    const pdf = await renderQuotationPdf({
        ref,
        dateStr: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
        ministryName: ministry.name,
        attentionName: ministry.attentionName, attentionTitle: ministry.attentionTitle,
        attentionPhone: ministry.contactPhone, poBox: ministry.poBox,
        eventName, venue, eventDate, duration, address,
        contacts: [
            contact1 || title1 || phone1 || email1 ? { name: contact1, title: title1, phone: phone1, email: email1 } : null,
            contact2 || title2 || phone2 || email2 ? { name: contact2, title: title2, phone: phone2, email: email2 } : null,
        ].filter(Boolean),
        lines: resolved.map((r) => {
            const d = itemDetail(r.item.itemNo);
            let mainDesc = (d && d.mainDesc) || r.item.description;
            if (r.item.itemNo === 6 && heads) mainDesc = `${mainDesc || ''}${mainDesc ? ' ' : ''}— Seating for ${heads} ministries`;
            return {
                scope: (d && d.scope) || r.item.name,
                mainDesc,
                qty: r.qty, unit: r.item.unit, unitPriceFils: r.item.unitPriceFils,
                lineTotalFils: r.lineTotalFils, subs: (d && d.subs) || [],
            };
        }),
        subtotalFils: totals.subtotal, vatFils: totals.vat, totalFils: totals.total,
    });

    const safeRef = ref.replace(/\//g, '-');
    const stored = await putPrivate(`ministry-quotations/${ministry.id}/${safeRef}.pdf`, pdf, 'application/pdf');
    await setQuotationPdfUrl(quote.id, stored.url);

    // Log to the master quotation-number sheet only when a NEW number was minted
    // (regenerations reuse the number, so they don't add rows). Best-effort.
    if (reserved.isNew) {
        await appendQuoteRow([
            ref,
            ministry.name,
            eventName || '',
            new Date().toLocaleDateString('en-GB'),
            (totals.total / 1000).toFixed(3),
        ]);
    }

    return NextResponse.json({ id: quote.id, ref, pdfUrl: `/q/${token}/quote/${quote.id}/pdf` });
}
