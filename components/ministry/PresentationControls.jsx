'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Admin-only: auto-generate a deck-style Technical Proposal PDF from the
// ministry's latest quotation. Once generated it stays viewable until the
// admin regenerates (which replaces the stored file). `onView(url, title)`
// opens the PDF in the caller's modal.
export default function PresentationControls({ ministry, onView }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const viewUrl = `/api/quotations/presentation?ministryId=${ministry.id}&v=${encodeURIComponent(ministry.presentationAt || '')}`;

    async function generate() {
        setErr('');
        setBusy(true);
        try {
            const res = await fetch('/api/quotations/presentation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ministryId: ministry.id }) });
            if (!res.ok) throw new Error((await res.text()) || 'Generation failed');
            router.refresh();
            onView(viewUrl + '&fresh=1', `${ministry.name} — technical proposal`);
        } catch (e) { setErr(e.message || 'Generation failed'); } finally { setBusy(false); }
    }

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {ministry.hasPresentation ? (
                <button type="button" onClick={() => onView(viewUrl, `${ministry.name} — technical proposal`)}
                    style={{ borderRadius: 6, border: '1px solid #00857A', background: '#fff', color: '#00857A', padding: '3px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    🎞 View presentation
                </button>
            ) : null}
            {ministry.quoteViewUrl ? (
                <button type="button" onClick={generate} disabled={busy} title="Build a deck-style Technical Proposal PDF from the latest quotation"
                    style={{ borderRadius: 6, border: 'none', background: busy ? '#cbd5e1' : '#4D4D4F', color: '#fff', padding: '4px 11px', fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>
                    {busy ? 'Generating…' : (ministry.hasPresentation ? '↻ Regenerate' : '🎞 Presentation')}
                </button>
            ) : null}
            {err ? <span style={{ fontSize: 11, color: '#dc2626' }}>{err}</span> : null}
        </span>
    );
}
