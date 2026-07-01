'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PhotoUploader({ ministryId }) {
    const router = useRouter();
    const [file, setFile] = useState(null);
    const [caption, setCaption] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function submit(e) {
        e.preventDefault();
        setError('');
        if (!file) { setError('Choose an image first.'); return; }
        setBusy(true);
        try {
            const fd = new FormData();
            fd.set('ministryId', String(ministryId));
            fd.set('caption', caption);
            fd.set('file', file);
            const res = await fetch('/api/quotations/photo', { method: 'POST', body: fd });
            if (!res.ok) throw new Error((await res.text()) || 'Upload failed');
            setFile(null); setCaption('');
            const input = document.getElementById('ministry-photo-input');
            if (input) input.value = '';
            router.refresh();
        } catch (err) { setError(err.message || 'Upload failed'); } finally { setBusy(false); }
    }

    return (
        <form onSubmit={submit} style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
            <input id="ministry-photo-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ gridColumn: '1 / -1', fontSize: 14 }} />
            <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" style={{ borderRadius: 8, border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: 14 }} />
            <button disabled={busy} style={{ justifySelf: 'start', borderRadius: 8, background: '#00857A', color: '#fff', padding: '8px 16px', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>{busy ? 'Uploading…' : 'Upload photo'}</button>
            {error ? <p style={{ gridColumn: '1 / -1', fontSize: 12, color: '#dc2626' }}>{error}</p> : null}
        </form>
    );
}
