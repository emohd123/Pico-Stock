'use client';
import { useState } from 'react';

// Free-text production note per meeting (stored on the quotation).
export default function ProductionNote({ quotationId, note }) {
    const [value, setValue] = useState(note || '');
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(false);
    const [err, setErr] = useState(false);

    async function save() {
        setBusy(true);
        setErr(false);
        try {
            const res = await fetch('/api/quotations/production', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quotationId, note: value }),
            });
            if (!res.ok) throw new Error();
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch { setErr(true); } finally { setBusy(false); }
    }

    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={2}
                placeholder="Production note for this meeting (e.g. extra crew, truck at 6am, hotel loading dock)…"
                style={{ flex: 1, borderRadius: 8, border: '1px solid #cbd5e1', padding: '6px 10px', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }} />
            <button type="button" onClick={save} disabled={busy}
                style={{ borderRadius: 6, background: busy ? '#cbd5e1' : '#00857A', color: '#fff', border: 'none', padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save note'}
            </button>
            {err ? <span style={{ fontSize: 11, color: '#dc2626', alignSelf: 'center' }}>Failed</span> : null}
        </div>
    );
}
