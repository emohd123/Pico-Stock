import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/ministry/auth';
import { putPrivate } from '@/lib/ministry/storage';
import { addPhoto } from '@/lib/ministry/queries';

export const runtime = 'nodejs';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX = 15 * 1024 * 1024;

export async function POST(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const form = await req.formData();
    const ministryId = Number(form.get('ministryId'));
    const caption = String(form.get('caption') || '').trim();
    const file = form.get('file');
    if (!ministryId || !(file instanceof File)) return new NextResponse('Bad request', { status: 400 });
    if (!ALLOWED.has(file.type)) return new NextResponse('Unsupported image type', { status: 400 });
    if (file.size > MAX) return new NextResponse('Image too large (max 15MB)', { status: 400 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const stored = await putPrivate(`ministry-photos/${ministryId}/${file.name}`, bytes, file.type);
    await addPhoto(ministryId, stored.url, stored.pathname, caption);
    return NextResponse.json({ ok: true });
}
