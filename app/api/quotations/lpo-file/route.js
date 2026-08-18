import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/ministry/auth';
import { putPrivate, getPrivate, delPrivate } from '@/lib/ministry/storage';
import { getMinistryById, setMinistryLpo, setMinistryLpoFile, logActivity } from '@/lib/ministry/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX = 25 * 1024 * 1024;
const TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

// The ministry's LPO document. Uploaded next to the "LPO received" tick and
// read back from the ministries list, the same way a quotation PDF is.

export async function POST(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const form = await req.formData();
    const ministryId = Number(form.get('ministryId'));
    const file = form.get('file');
    if (!ministryId || !(file instanceof File)) return new NextResponse('Bad request', { status: 400 });
    if (!TYPES.includes(file.type)) return new NextResponse('Upload a PDF or an image of the LPO', { status: 400 });
    if (file.size > MAX) return new NextResponse('File too large (max 25MB)', { status: 400 });

    const ministry = await getMinistryById(ministryId);
    if (!ministry) return new NextResponse('Ministry not found', { status: 404 });

    const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
    const bytes = new Uint8Array(await file.arrayBuffer());
    const stored = await putPrivate(`ministry-lpo/${ministryId}/lpo.${ext}`, bytes, file.type);

    const oldUrl = ministry.lpoBlobUrl;
    await setMinistryLpoFile(ministryId, { url: stored.url, name: file.name, size: file.size });
    // Receiving the document is the event the tick stands for, so record both.
    if (!ministry.lpoReceived) await setMinistryLpo(ministryId, true);
    if (oldUrl && oldUrl !== stored.url) { try { await delPrivate(oldUrl); } catch { /* ignore */ } }

    await logActivity({
        ministryId, actor: 'admin', action: 'lpo.uploaded',
        detail: `LPO uploaded — ${file.name}`,
    });
    return NextResponse.json({ ok: true, name: file.name, size: file.size });
}

export async function DELETE(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const ministryId = Number(new URL(req.url).searchParams.get('ministryId'));
    const ministry = ministryId ? await getMinistryById(ministryId) : null;
    if (!ministry) return new NextResponse('Ministry not found', { status: 404 });

    const oldUrl = ministry.lpoBlobUrl;
    // Only the file goes; whether the LPO was received stays the admin's call.
    await setMinistryLpoFile(ministryId, null);
    if (oldUrl) { try { await delPrivate(oldUrl); } catch { /* ignore */ } }
    await logActivity({ ministryId, actor: 'admin', action: 'lpo.removed', detail: 'LPO file removed' });
    return NextResponse.json({ ok: true });
}

export async function GET(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const url = new URL(req.url);
    const ministry = await getMinistryById(Number(url.searchParams.get('ministryId')));
    if (!ministry || !ministry.lpoBlobUrl) return new NextResponse('No LPO uploaded yet', { status: 404 });

    const file = await getPrivate(ministry.lpoBlobUrl);
    if (!file) return new NextResponse('Not found', { status: 404 });
    const slug = ministry.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const ext = (ministry.lpoBlobUrl.split('.').pop() || 'pdf').split('?')[0];
    const type = ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : 'application/pdf';
    return new NextResponse(file.body, {
        headers: {
            'Content-Type': type,
            'Content-Disposition': `${url.searchParams.get('download') ? 'attachment' : 'inline'}; filename="LPO-${slug}.${ext}"`,
            'Cache-Control': 'no-store',
        },
    });
}
