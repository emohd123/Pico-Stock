import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/ministry/auth';
import { getPrivate, delPrivate } from '@/lib/ministry/storage';
import { contentDisposition } from '@/lib/ministry/download';
import {
    getMinistryById, getMinistryLpo, addMinistryLpo, deleteMinistryLpo,
    setMinistryLpo, logActivity,
} from '@/lib/ministry/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A ministry's LPO documents. The upload goes straight from the browser to Blob
// (see /api/quotations/production/blob-upload); this route records each file,
// streams it back, and removes one.

export async function POST(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const body = await req.json();
    const ministryId = Number(body.ministryId);
    if (!ministryId || !body.blobUrl || !body.name) return new NextResponse('Bad request', { status: 400 });

    const ministry = await getMinistryById(ministryId);
    if (!ministry) return new NextResponse('Ministry not found', { status: 404 });

    await addMinistryLpo(ministryId, {
        url: body.blobUrl, name: String(body.name).slice(0, 200),
        type: body.contentType || '', size: Number(body.sizeBytes) || null,
    });
    // Receiving a purchase order is the event the tick stands for.
    if (!ministry.lpoReceived) await setMinistryLpo(ministryId, true);
    await logActivity({ ministryId, actor: 'admin', action: 'lpo.uploaded', detail: `LPO uploaded — ${body.name}` });
    return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const id = Number(new URL(req.url).searchParams.get('id'));
    const lpo = id ? await getMinistryLpo(id) : null;
    if (!lpo) return new NextResponse('Not found', { status: 404 });

    // Only this document goes; whether the LPO was received stays the admin's
    // call, and other documents on the ministry are untouched.
    await deleteMinistryLpo(id);
    try { await delPrivate(lpo.blobUrl); } catch { /* ignore */ }
    await logActivity({ ministryId: lpo.ministryId, actor: 'admin', action: 'lpo.removed', detail: `LPO removed — ${lpo.fileName}` });
    return NextResponse.json({ ok: true });
}

export async function GET(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const url = new URL(req.url);
    const lpo = await getMinistryLpo(Number(url.searchParams.get('id')));
    if (!lpo) return new NextResponse('No such LPO', { status: 404 });

    let file = null;
    try { file = await getPrivate(lpo.blobUrl); } catch { file = null; }
    if (!file) return new NextResponse('Not found', { status: 404 });
    return new NextResponse(file.body, {
        headers: {
            'Content-Type': lpo.fileType || file.contentType || 'application/pdf',
            'Content-Disposition': contentDisposition(lpo.fileName || 'LPO.pdf', { inline: !url.searchParams.get('download') }),
            'Cache-Control': 'no-store',
        },
    });
}
