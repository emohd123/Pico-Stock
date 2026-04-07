import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { generateDraftWithAi } from '@/lib/quotationAi';

export const runtime = 'nodejs';

export async function POST(request) {
    const payload = await request.json();
    const files = Array.isArray(payload.files) ? payload.files : [];

    try {
        const result = await generateDraftWithAi({
            quotation: payload.quotation || {},
            brief: payload.brief || '',
            files,
            mode: payload.mode === 'duplicate' ? 'duplicate' : 'draft',
        });

        // Clean up any temporary blob files
        const blobUrls = files.filter((f) => f.url).map((f) => f.url);
        if (blobUrls.length) {
            Promise.all(blobUrls.map((url) => del(url))).catch(() => {});
        }

        return NextResponse.json(result);
    } catch (error) {
        // Best-effort cleanup even on error
        const blobUrls = files.filter((f) => f.url).map((f) => f.url);
        if (blobUrls.length) {
            Promise.all(blobUrls.map((url) => del(url))).catch(() => {});
        }
        console.error('[quotation ai draft] failed:', error);
        return NextResponse.json({ error: 'Failed to generate AI draft' }, { status: 500 });
    }
}
