import { NextResponse } from 'next/server';
import { getPrivate } from '@/lib/ministry/storage';
import { getMinistryByToken, getPhotoForMinistry } from '@/lib/ministry/queries';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Serves a gallery photo. With ?w=<px> it returns an auto-oriented, resized JPEG
// (fast thumbnails for the grid / lightbox); without it, the original bytes.
// Derived variants are immutable per (id, w, q) so the CDN caches them.
export async function GET(req, { params }) {
    const { token, id } = params;
    const ministry = await getMinistryByToken(token);
    if (!ministry) return new NextResponse('Not found', { status: 404 });
    const photo = await getPhotoForMinistry(ministry.id, Number(id));
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
            body = await sharp(Buffer.from(file.body))
                .rotate() // honour EXIF orientation (phone photos)
                .resize({ width: w, withoutEnlargement: true })
                .jpeg({ quality: q, mozjpeg: true })
                .toBuffer();
            ct = 'image/jpeg';
        } catch (e) { console.error('[photo-resize] sharp failed:', e?.message || e); /* fall back to original bytes */ }
    }
    return new NextResponse(body, {
        headers: {
            'Content-Type': ct,
            'Cache-Control': w > 0 ? 'public, max-age=31536000, immutable' : 'private, max-age=3600',
        },
    });
}
