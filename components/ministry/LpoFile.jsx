'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmtSize } from '@/lib/ministry/production';

// The LPO document itself. Uploading one also ticks "LPO received" on the
// server, because the document arriving is the event the tick stands for.
export default function LpoFile({ ministryId, name, size, uploadedAt }) {
    const router = useRouter();
    const inputRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const url = `/api/quotations/lpo-file?ministryId=${ministryId}`;

    async function onPick(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setError('');
        setBusy(true);
        try {
            const fd = new FormData();
            fd.set('ministryId', String(ministryId));
            fd.set('file', file);
            const res = await fetch('/api/quotations/lpo-file', { method: 'POST', body: fd });
            if (!res.ok) throw new Error((await res.text()) || 'Upload failed');
            if (inputRef.current) inputRef.current.value = '';
            router.refresh();
        } catch (err) { setError(err.message || 'Upload failed'); } finally { setBusy(false); }
    }

    async function remove() {
        if (!confirm('Remove the uploaded LPO file? The “LPO received” tick stays as it is.')) return;
        setBusy(true);
        try {
            const res = await fetch(`${url}`, { method: 'DELETE' });
            if (!res.ok) throw new Error((await res.text()) || 'Could not remove');
            router.refresh();
        } catch (err) { setError(err.message || 'Could not remove'); } finally { setBusy(false); }
    }

    const chip = {
        borderRadius: 4, border: '1px solid #cbd5e1', background: '#fff', color: '#00857A',
        padding: '4px 8px', fontSize: 12, fontWeight: 600, textDecoration: 'none',
        cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png" onChange={onPick} style={{ display: 'none' }} />
            {name ? (
                <>
                    <span style={{ fontSize: 12, color: '#4D4D4F' }}>
                        📄 <strong style={{ color: '#22282B' }}>{name}</strong>
                        <span style={{ color: '#94a3b8' }}>
                            {size ? ` · ${fmtSize(size)}` : ''}{uploadedAt ? ` · ${String(uploadedAt).slice(0, 10)}` : ''}
                        </span>
                    </span>
                    <a href={url} target="_blank" rel="noreferrer" style={chip}>View</a>
                    <a href={`${url}&download=1`} style={chip}>Download</a>
                    <button type="button" onClick={() => inputRef.current && inputRef.current.click()} disabled={busy} style={chip}>
                        {busy ? 'Working…' : 'Replace'}
                    </button>
                    <button type="button" onClick={remove} disabled={busy}
                        style={{ ...chip, color: '#dc2626', borderColor: '#fecaca' }}>Remove</button>
                </>
            ) : (
                <>
                    <button type="button" onClick={() => inputRef.current && inputRef.current.click()} disabled={busy} style={chip}>
                        {busy ? 'Uploading…' : '⤴ Upload LPO'}
                    </button>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>PDF or a photo of the LPO, up to 25MB.</span>
                </>
            )}
            {error ? <span style={{ fontSize: 11, color: '#dc2626' }}>{error}</span> : null}
        </div>
    );
}
