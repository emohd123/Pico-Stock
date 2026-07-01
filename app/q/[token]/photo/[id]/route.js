import { NextResponse } from 'next/server';
import { getPrivate } from '@/lib/ministry/storage';
import { getMinistryByToken, getPhotoForMinistry } from '@/lib/ministry/queries';

export const runtime = 'nodejs';

export async function GET(_req, { params }) {
    const { token, id } = params;
    const ministry = await getMinistryByToken(token);
    if (!ministry) return new NextResponse('Not found', { status: 404 });
    const photo = await getPhotoForMinistry(ministry.id, Number(id));
    if (!photo) return new NextResponse('Not found', { status: 404 });
    const file = await getPrivate(photo.blobUrl);
    if (!file) return new NextResponse('Not found', { status: 404 });
    return new NextResponse(file.body, {
        headers: { 'Content-Type': file.contentType, 'Cache-Control': 'private, max-age=3600' },
    });
}
