import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/ministry/auth';
import { putPrivate, delPrivate } from '@/lib/ministry/storage';
import { getQuotationForMinistry, setQuotationPdfUrl } from '@/lib/ministry/queries';

export const runtime = 'nodejs';
export const maxDuration = 30;
const MAX = 25 * 1024 * 1024;

// Admin uploads a final/official quotation PDF that replaces the stored one for a
// quotation. The ministry's View/Save and the admin Open/Download then serve it.
export async function POST(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const form = await req.formData();
    const ministryId = Number(form.get('ministryId'));
    const quoteId = Number(form.get('quoteId'));
    const file = form.get('file');
    if (!ministryId || !quoteId || !(file instanceof File)) return new NextResponse('Bad request', { status: 400 });
    if (file.type !== 'application/pdf') return new NextResponse('Please upload a PDF file', { status: 400 });
    if (file.size > MAX) return new NextResponse('PDF too large (max 25MB)', { status: 400 });

    const quote = await getQuotationForMinistry(ministryId, quoteId);
    if (!quote) return new NextResponse('Quotation not found', { status: 404 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const safeRef = String(quote.ref).replace(/\//g, '-');
    const stored = await putPrivate(`ministry-quotations/${ministryId}/final-${safeRef}.pdf`, bytes, 'application/pdf');

    const oldUrl = quote.pdfBlobUrl;
    await setQuotationPdfUrl(quoteId, stored.url);
    if (oldUrl && oldUrl !== stored.url) { try { await delPrivate(oldUrl); } catch { /* ignore */ } }

    return NextResponse.json({ ok: true });
}
