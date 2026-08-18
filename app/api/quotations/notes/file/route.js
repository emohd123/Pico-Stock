import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/ministry/auth';
import { getPrivate, delPrivate } from '@/lib/ministry/storage';
import {
    getMinistryNote, setMinistryNoteFile, setMinistryNoteShared, logActivity,
} from '@/lib/ministry/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The file attached to a project note. The upload itself goes straight from the
// browser to Blob (see /api/quotations/production/blob-upload) — this route only
// records it, flips whether production may see it, and streams it back.

export async function POST(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const body = await req.json();
    const ministryId = Number(body.ministryId);
    const noteId = Number(body.noteId);
    if (!ministryId || !noteId) return new NextResponse('Bad request', { status: 400 });

    if ('shared' in body) {
        await setMinistryNoteShared(ministryId, noteId, body.shared);
        return NextResponse.json({ ok: true });
    }

    if (!body.blobUrl || !body.name) return new NextResponse('Bad request', { status: 400 });
    const note = await getMinistryNote(noteId);
    const oldUrl = note && note.fileUrl;
    await setMinistryNoteFile(ministryId, noteId, {
        url: body.blobUrl, name: String(body.name).slice(0, 200),
        type: body.contentType || '', size: Number(body.sizeBytes) || null,
    });
    if (oldUrl && oldUrl !== body.blobUrl) { try { await delPrivate(oldUrl); } catch { /* ignore */ } }
    await logActivity({ ministryId, actor: 'admin', action: 'note.file.attached', detail: `Attached ${body.name} to a project note` });
    return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const url = new URL(req.url);
    const ministryId = Number(url.searchParams.get('ministryId'));
    const noteId = Number(url.searchParams.get('noteId'));
    if (!ministryId || !noteId) return new NextResponse('Bad request', { status: 400 });

    const note = await getMinistryNote(noteId);
    await setMinistryNoteFile(ministryId, noteId, null);
    if (note && note.fileUrl) { try { await delPrivate(note.fileUrl); } catch { /* ignore */ } }
    await logActivity({ ministryId, actor: 'admin', action: 'note.file.removed', detail: 'Removed a project note attachment' });
    return NextResponse.json({ ok: true });
}

export async function GET(req) {
    if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
    const url = new URL(req.url);
    const note = await getMinistryNote(Number(url.searchParams.get('noteId')));
    if (!note || !note.fileUrl) return new NextResponse('No file on this note', { status: 404 });

    const file = await getPrivate(note.fileUrl);
    if (!file) return new NextResponse('Not found', { status: 404 });
    return new NextResponse(file.body, {
        headers: {
            'Content-Type': note.fileType || 'application/octet-stream',
            'Content-Disposition': `${url.searchParams.get('download') ? 'attachment' : 'inline'}; filename="${(note.fileName || 'note-file').replace(/"/g, '')}"`,
            'Cache-Control': 'no-store',
        },
    });
}
