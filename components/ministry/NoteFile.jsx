'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import { fmtSize } from '@/lib/ministry/production';

// One file per project note — the layout, the artwork, the signed page the note
// is talking about. Tick "Show to production" and the crew's share link lists it
// for download; leave it off and the file stays internal to PICO.
export default function NoteFile({ ministryId, noteId, name, size, shared }) {
    const router = useRouter();
    const inputRef = useRef(null);
    const [busy, setBusy] = useState('');
    const [err, setErr] = useState('');
    const [isShared, setIsShared] = useState(Boolean(shared));
    const url = `/api/quotations/notes/file?ministryId=${ministryId}&noteId=${noteId}`;

    async function onPick(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setErr('');
        setBusy(file.name);
        try {
            // Straight to Blob from the browser, so a big layout PDF is not
            // capped by the serverless request body limit.
            const blob = await upload(`note-files/${ministryId}/${noteId}/${file.name}`, file, {
                access: 'private',
                handleUploadUrl: '/api/quotations/production/blob-upload',
            });
            const res = await fetch('/api/quotations/notes/file', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ministryId, noteId, blobUrl: blob.url, name: file.name,
                    contentType: file.type, sizeBytes: file.size,
                }),
            });
            if (!res.ok) throw new Error((await res.text()) || 'Could not attach');
            if (inputRef.current) inputRef.current.value = '';
            router.refresh();
        } catch (e2) { setErr(e2.message || `Could not upload ${file.name}`); } finally { setBusy(''); }
    }

    async function remove() {
        if (!window.confirm(`Remove "${name}" from this note?`)) return;
        setBusy(name);
        try {
            const res = await fetch(`${url}`, { method: 'DELETE' });
            if (!res.ok) throw new Error();
            router.refresh();
        } catch { setErr('Could not remove the file'); } finally { setBusy(''); }
    }

    async function toggleShared(e) {
        const next = e.target.checked;
        setIsShared(next);
        try {
            const res = await fetch('/api/quotations/notes/file', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ministryId, noteId, shared: next }),
            });
            if (!res.ok) throw new Error();
            router.refresh();
        } catch { setIsShared(!next); setErr('Could not change who sees this file'); }
    }

    const chip = {
        borderRadius: 4, border: '1px solid #cbd5e1', background: '#fff', color: '#00857A',
        padding: '3px 8px', fontSize: 11.5, fontWeight: 600, textDecoration: 'none',
        cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
            <input ref={inputRef} type="file" onChange={onPick} style={{ display: 'none' }} />
            {name ? (
                <>
                    <span style={{ fontSize: 11.5, color: '#4D4D4F' }}>
                        📎 <strong style={{ color: '#22282B' }}>{name}</strong>
                        {size ? <span style={{ color: '#94a3b8' }}> · {fmtSize(size)}</span> : null}
                    </span>
                    <a href={url} target="_blank" rel="noreferrer" style={chip}>View</a>
                    <a href={`${url}&download=1`} style={chip}>Download</a>
                    <button type="button" onClick={() => inputRef.current && inputRef.current.click()} disabled={Boolean(busy)} style={chip}>Replace</button>
                    <button type="button" onClick={remove} disabled={Boolean(busy)} style={{ ...chip, color: '#dc2626', borderColor: '#fecaca' }}>Remove</button>
                    <label title="Production sees this file on the shared sheet"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: isShared ? '#00857A' : '#94a3b8', cursor: 'pointer' }}>
                        <input type="checkbox" checked={isShared} onChange={toggleShared} style={{ width: 14, height: 14, accentColor: '#00857A' }} />
                        Show to production
                    </label>
                </>
            ) : (
                <button type="button" onClick={() => inputRef.current && inputRef.current.click()} disabled={Boolean(busy)} style={chip}>
                    {busy ? `Uploading ${busy}…` : '📎 Attach file'}
                </button>
            )}
            {err ? <span style={{ fontSize: 11, color: '#dc2626' }}>{err}</span> : null}
        </div>
    );
}
