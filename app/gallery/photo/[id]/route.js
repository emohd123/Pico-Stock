import { NextResponse } from 'next/server';
import { getPrivate } from '@/lib/ministry/storage';
import { getPhotoById } from '@/lib/ministry/queries';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Shared event-gallery photo (any ministry), served resized via ?w=&q=.
export async function GET(req, { params }) {
    const photo = await getPhotoById(Number(params.id));
    if (!photo) return new NextResponse('Not found', { status: 404 });
    const file = await getPrivate(photo.blobUrl);
    if (!file) return new NextResponse('Not found', { status: 404 });

    const sp = new URL(req.url).searchParams;
    const w = Math.min(3000, parseInt(sp.get('w'), 10) || 0);
    const q = Math.min(95, Math.max(30, parseInt(sp.get('q'), 10) || 72));

    let body = file.body;
    let ct = file.contentType;
    if (w > 0) {
        try {
            const sharp = (await import('sharp')).default;
            body = await sharp(Buffer.from(file.body)).rotate().resize({ width: w, withoutEnlargement: true }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
            ct = 'image/jpeg';
        } catch (e) { console.error('[gallery-photo] sharp failed:', e?.message || e); }
    }
    return new NextResponse(body, {
        headers: {
            'Content-Type': ct,
            'Cache-Control': w > 0 ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
        },
    });
}
