'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Admin-only: replace a quotation's PDF with an uploaded final/official version.
export default function ReplaceQuotePdf({ ministryId, quoteId }) {
    const router = useRouter();
    const inputRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function onPick(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setError('');
        setBusy(true);
        try {
            const fd = new FormData();
            fd.set('ministryId', String(ministryId));
            fd.set('quoteId', String(quoteId));
            fd.set('file', file);
            const res = await fetch('/api/quotations/replace-pdf', { method: 'POST', body: fd });
            if (!res.ok) throw new Error((await res.text()) || 'Upload failed');
            if (inputRef.current) inputRef.current.value = '';
            router.refresh();
        } catch (err) { setError(err.message || 'Upload failed'); } finally { setBusy(false); }
    }

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input ref={inputRef} type="file" accept="application/pdf" onChange={onPick} style={{ display: 'none' }} />
            <button type="button" onClick={() => inputRef.current && inputRef.current.click()} disabled={busy}
                title="Upload a final PDF to replace this quotation"
                style={{ borderRadius: 4, border: '1px solid #cbd5e1', background: '#fff', color: '#00857A', padding: '4px 8px', fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Uploading…' : '⤴ Replace PDF'}
            </button>
            {error ? <span style={{ fontSize: 11, color: '#dc2626' }}>{error}</span> : null}
        </span>
    );
}
