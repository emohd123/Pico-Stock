'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import { fmtSize } from '@/lib/ministry/production';

// Admin side of the shared files list: upload logos / artwork / layouts that
// production and suppliers download from the share link.
export default function ProductionFiles({ quotationId, files }) {
    const router = useRouter();
    const inputRef = useRef(null);
    const [busy, setBusy] = useState('');
    const [err, setErr] = useState('');

    async function onPick(e) {
        const picked = Array.from(e.target.files || []);
        if (!picked.length) return;
        setErr('');
        for (const file of picked) {
            setBusy(file.name);
            try {
                // Straight from the browser to Blob, so large artwork is not
                // capped by the serverless request body limit.
                const blob = await upload(`production/${quotationId}/${file.name}`, file, {
                    access: 'private',
                    handleUploadUrl: '/api/quotations/production/blob-upload',
                });
                const res = await fetch('/api/quotations/production/files', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        quotationId, blobUrl: blob.url, pathname: blob.pathname,
                        name: file.name, contentType: file.type, sizeBytes: file.size,
                    }),
                });
                if (!res.ok) throw new Error();
            } catch {
                setErr(`Could not upload ${file.name}`);
            }
        }
        setBusy('');
        if (inputRef.current) inputRef.current.value = '';
        router.refresh();
    }

    async function remove(id, name) {
        if (!window.confirm(`Remove "${name}" from this meeting? Production will no longer see it.`)) return;
        setBusy(name);
        try {
            const res = await fetch(`/api/quotations/production/files?id=${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error();
        } catch { setErr(`Could not remove ${name}`); } finally { setBusy(''); }
        router.refresh();
    }

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 12, color: '#22282B' }}>Files for production</strong>
                <button type="button" onClick={() => inputRef.current?.click()} disabled={Boolean(busy)}
                    style={{ borderRadius: 6, background: busy ? '#cbd5e1' : '#00857A', color: '#fff', border: 'none', padding: '5px 11px', fontSize: 11.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>
                    {busy ? `Uploading ${busy}…` : '＋ Add files'}
                </button>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Logo, artwork, layouts — up to 50MB each. They download these from the share link.</span>
                <input ref={inputRef} type="file" multiple onChange={onPick} style={{ display: 'none' }} />
            </div>
            {err ? <p style={{ margin: '6px 0 0', fontSize: 11, color: '#dc2626' }}>{err}</p> : null}

            {files.length ? (
                <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {files.map((f) => (
                        <li key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 6, background: '#f8fafc', padding: '4px 9px', fontSize: 11.5 }}>
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#22282B' }}>{f.name}</span>
                            <span style={{ color: '#94a3b8' }}>{fmtSize(f.sizeBytes)}</span>
                            <button type="button" onClick={() => remove(f.id, f.name)}
                                style={{ border: 'none', background: 'none', color: '#dc2626', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Remove</button>
                        </li>
                    ))}
                </ul>
            ) : (
                <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#94a3b8' }}>No files yet.</p>
            )}
        </div>
    );
}
