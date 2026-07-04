'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Multi-file gallery uploader: pick many photos at once and they upload one by
// one with progress. Optional caption is applied to every file in the batch.
export default function PhotoUploader({ ministryId }) {
    const router = useRouter();
    const [files, setFiles] = useState([]);
    const [caption, setCaption] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(0);
    const [error, setError] = useState('');

    async function submit(e) {
        e.preventDefault();
        setError('');
        if (!files.length) { setError('Choose one or more images first.'); return; }
        setBusy(true);
        setDone(0);
        let failed = 0;
        for (let i = 0; i < files.length; i++) {
            try {
                const fd = new FormData();
                fd.set('ministryId', String(ministryId));
                fd.set('caption', caption);
                fd.set('file', files[i]);
                const res = await fetch('/api/quotations/photo', { method: 'POST', body: fd });
                if (!res.ok) throw new Error(await res.text());
            } catch { failed += 1; }
            setDone(i + 1);
        }
        setBusy(false);
        setFiles([]); setCaption('');
        const input = document.getElementById('ministry-photo-input');
        if (input) input.value = '';
        if (failed) setError(`${failed} of ${files.length} photo(s) failed to upload.`);
        router.refresh();
    }

    return (
        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
            <input id="ministry-photo-input" type="file" multiple accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setFiles(Array.from(e.target.files || []))} style={{ fontSize: 14 }} />
            {files.length > 0 ? <div style={{ fontSize: 12, color: '#00857A', fontWeight: 600 }}>{files.length} photo(s) selected</div> : null}
            <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption for all (optional) — e.g. GCC Ministers Meeting, Sheraton, 21 Jun 2026" style={{ borderRadius: 8, border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: 14 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button disabled={busy} style={{ borderRadius: 8, background: '#00857A', color: '#fff', padding: '8px 16px', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                    {busy ? `Uploading ${done}/${files.length}…` : (files.length > 1 ? `Upload ${files.length} photos` : 'Upload photo')}
                </button>
                {busy ? <span style={{ fontSize: 12, color: '#75787B' }}>Please keep this tab open until it finishes.</span> : null}
            </div>
            {error ? <p style={{ fontSize: 12, color: '#dc2626' }}>{error}</p> : null}
        </form>
    );
}
