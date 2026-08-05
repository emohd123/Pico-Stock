import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/ministry/auth';
import { addProductionFile, getProductionFile, deleteProductionFile } from '@/lib/ministry/queries';
import { delPrivate } from '@/lib/ministry/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Record a file the browser has just uploaded to Blob.
export async function POST(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const body = await req.json();
    const quotationId = Number(body.quotationId);
    const blobUrl = String(body.blobUrl || '');
    const name = String(body.name || '').trim().slice(0, 200);
    if (!quotationId || !blobUrl || !name) return new NextResponse('Bad request', { status: 400 });

    await addProductionFile(quotationId, {
        name, blobUrl, pathname: body.pathname || null,
        contentType: body.contentType || null, sizeBytes: Number(body.sizeBytes) || null,
    });
    return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const fileId = Number(new URL(req.url).searchParams.get('id'));
    if (!fileId) return new NextResponse('Bad request', { status: 400 });

    const file = await getProductionFile(fileId);
    if (!file) return new NextResponse('Not found', { status: 404 });
    // Drop the row first: a stale row pointing at a deleted blob is worse than
    // an orphaned blob, which costs storage but breaks nothing.
    await deleteProductionFile(fileId);
    try { await delPrivate(file.blobUrl); } catch { /* blob already gone */ }
    return NextResponse.json({ ok: true });
}
