'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import { fmtSize } from '@/lib/ministry/production';

// A ministry's LPO documents. More than one is normal — a purchase order per
// meeting, an amended one, the signed copy that follows the emailed one — so
// this is a list that grows rather than a single slot that gets overwritten.
// Uploading the first one also ticks "LPO received".
export default function LpoFile({ ministryId, files = [] }) {
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
                // Straight to Blob from the browser, so a scanned multi-page LPO
                // is not capped by the serverless request body limit.
                const blob = await upload(`ministry-lpo/${ministryId}/${file.name}`, file, {
                    access: 'private',
                    handleUploadUrl: '/api/quotations/production/blob-upload',
                });
                const res = await fetch('/api/quotations/lpo-file', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ministryId, blobUrl: blob.url, name: file.name,
                        contentType: file.type, sizeBytes: file.size,
                    }),
                });
                if (!res.ok) throw new Error((await res.text()) || 'Could not save');
            } catch (e2) {
                setErr(e2.message || `Could not upload ${file.name}`);
            }
        }
        setBusy('');
        if (inputRef.current) inputRef.current.value = '';
        router.refresh();
    }

    async function remove(id, name) {
        if (!window.confirm(`Remove "${name}"? The “LPO received” tick stays as it is.`)) return;
        setBusy(name);
        try {
            const res = await fetch(`/api/quotations/lpo-file?id=${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error();
            router.refresh();
        } catch { setErr(`Could not remove ${name}`); } finally { setBusy(''); }
    }

    const chip = {
        borderRadius: 4, border: '1px solid #cbd5e1', background: '#fff', color: '#00857A',
        padding: '3px 8px', fontSize: 11.5, fontWeight: 600, textDecoration: 'none',
        cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
    };

    return (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input ref={inputRef} type="file" multiple accept="application/pdf,image/jpeg,image/png"
                onChange={onPick} style={{ display: 'none' }} />

            {files.map((f) => {
                const url = `/api/quotations/lpo-file?id=${f.id}`;
                return (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11.5, color: '#4D4D4F', flex: 1, minWidth: 200 }}>
                            📄 <strong style={{ color: '#22282B' }}>{f.fileName}</strong>
                            <span style={{ color: '#94a3b8' }}>
                                {f.sizeBytes ? ` · ${fmtSize(f.sizeBytes)}` : ''}
                                {f.uploadedAt ? ` · ${String(f.uploadedAt).slice(0, 10)}` : ''}
                            </span>
                        </span>
                        <a href={url} target="_blank" rel="noreferrer" style={chip}>View</a>
                        <a href={`${url}&download=1`} style={chip}>Download</a>
                        <button type="button" onClick={() => remove(f.id, f.fileName)} disabled={Boolean(busy)}
                            style={{ ...chip, color: '#dc2626', borderColor: '#fecaca' }}>Remove</button>
                    </div>
                );
            })}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => inputRef.current && inputRef.current.click()} disabled={Boolean(busy)} style={chip}>
                    {busy ? `Uploading ${busy}…` : files.length ? '⤴ Add another LPO' : '⤴ Upload LPO'}
                </button>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    PDF or a photo. You can pick several at once.
                </span>
                {err ? <span style={{ fontSize: 11, color: '#dc2626' }}>{err}</span> : null}
            </div>
        </div>
    );
}
