import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/ministry/auth';
import { scanQuotationText } from '@/lib/ministry/quotationScan';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const MAX = 4 * 1024 * 1024;

// Read an uploaded quotation PDF and report what it contains, so the upload form
// can pre-tick the items instead of the admin re-entering thirty rows by hand.
// Nothing is saved here — it is a read of the file the browser just picked.
export async function POST(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return new NextResponse('Bad request', { status: 400 });
    if (file.type !== 'application/pdf') return new NextResponse('Please upload a PDF file', { status: 400 });
    if (file.size > MAX) return new NextResponse('PDF too large (max 4MB)', { status: 400 });

    try {
        const mod = await import('pdf-parse');
        const PDFParse = mod.PDFParse || mod.default?.PDFParse || mod.default;
        const parser = new PDFParse({ data: Buffer.from(await file.arrayBuffer()) });
        const { text } = await parser.getText();
        if (!text || !text.trim()) {
            // A scan with no text layer can't be read — the admin ticks by hand.
            return NextResponse.json({ ok: true, readable: false, meta: {}, matched: [], extras: [] });
        }
        return NextResponse.json({ ok: true, readable: true, ...scanQuotationText(text) });
    } catch {
        return NextResponse.json({ ok: true, readable: false, meta: {}, matched: [], extras: [] });
    }
}
