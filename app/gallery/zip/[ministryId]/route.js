import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { getPrivate } from '@/lib/ministry/storage';
import { getMinistryById, getMinistryPhotos } from '@/lib/ministry/queries';

export const runtime = 'nodejs';
export const maxDuration = 60;

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
function slug(s) { return String(s || 'ministry').replace(/[^A-Za-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

// Shared: download a ministry's whole album as one zip, foldered by name. By id.
export async function GET(_req, { params }) {
    const ministry = await getMinistryById(Number(params.ministryId));
    if (!ministry) return new NextResponse('Not found', { status: 404 });
    const photos = await getMinistryPhotos(ministry.id);
    if (!photos.length) return new NextResponse('No photos', { status: 404 });

    const zip = new JSZip();
    const folder = zip.folder(ministry.name);
    let i = 0;
    for (const p of photos) {
        const file = await getPrivate(p.blobUrl);
        if (!file) continue;
        i += 1;
        const ext = EXT[file.contentType] || '.jpg';
        const base = p.caption ? slug(p.caption) : `photo-${String(i).padStart(2, '0')}`;
        folder.file(`${String(i).padStart(2, '0')}-${base}${ext}`, file.body);
    }
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
    return new NextResponse(buf, {
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${slug(ministry.name)}-photos.zip"`,
            'Cache-Control': 'private, max-age=0, must-revalidate',
        },
    });
}
